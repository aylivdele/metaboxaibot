import OpenAI, { toFile, type ClientOptions as OpenAIClientOptions } from "openai";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config, UserFacingError } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/** Per-million-token USD rates. Text/image-input rates match across versions;
 *  image-output rate differs (1.5 → $32/M, 2 → $30/M). */
const RATE_TEXT_INPUT = 5 / 1_000_000;
const RATE_TEXT_INPUT_CACHED = 1.25 / 1_000_000;
const RATE_IMAGE_INPUT = 8 / 1_000_000;
const RATE_IMAGE_INPUT_CACHED = 2 / 1_000_000;
const RATE_IMAGE_OUTPUT_BY_MODEL: Record<string, number> = {
  "gpt-image-1.5": 32 / 1_000_000,
  "gpt-image-2": 30 / 1_000_000,
};

/** Fallback image-output token counts per quality × size (used when `usage` absent). */
const OUTPUT_TOKENS_FALLBACK: Record<string, Record<string, number>> = {
  low: { "1024x1024": 272, "1024x1536": 408, "1536x1024": 400 },
  medium: { "1024x1024": 1056, "1024x1536": 1584, "1536x1024": 1568 },
  high: { "1024x1024": 4160, "1024x1536": 6240, "1536x1024": 6208 },
};

interface GptImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    text_tokens?: number;
    image_tokens?: number;
    cached_tokens?: number;
    cached_text_tokens?: number;
    cached_image_tokens?: number;
  };
}

function computeCostFromUsage(
  usage: GptImageUsage | undefined,
  outputImageTokensEstimate: number,
  rateImageOutput: number,
): number | null {
  if (!usage) return null;
  const details = usage.input_tokens_details ?? {};
  const imageIn = details.image_tokens ?? 0;
  const textIn = details.text_tokens ?? Math.max(0, (usage.input_tokens ?? 0) - imageIn);
  const cachedImage = details.cached_image_tokens ?? 0;
  const cachedText = details.cached_text_tokens ?? details.cached_tokens ?? 0;
  const billedTextIn = Math.max(0, textIn - cachedText);
  const billedImageIn = Math.max(0, imageIn - cachedImage);
  // OpenAI's `output_tokens` for image endpoints counts image-output tokens.
  // Text-output reasoning tokens aren't separately reported for
  // images.generate/edit — treat the whole output_tokens bucket as image output.
  const imageOut = usage.output_tokens ?? outputImageTokensEstimate;
  return (
    billedTextIn * RATE_TEXT_INPUT +
    cachedText * RATE_TEXT_INPUT_CACHED +
    billedImageIn * RATE_IMAGE_INPUT +
    cachedImage * RATE_IMAGE_INPUT_CACHED +
    imageOut * rateImageOutput
  );
}

/**
 * GPT Image adapter — uses OpenAI Images API.
 * Returns raw base64 data (no public URL) so generation.service uploads to S3.
 */
export class GptImageAdapter implements ImageAdapter {
  readonly modelId: string;
  readonly isAsync = false;

  private client: OpenAI;
  private rateImageOutput: number;

  constructor(
    modelId: string = "gpt-image-1.5",
    apiKey = config.ai.openai,
    fetchFn?: typeof globalThis.fetch,
  ) {
    this.modelId = modelId;
    this.rateImageOutput =
      RATE_IMAGE_OUTPUT_BY_MODEL[modelId] ?? RATE_IMAGE_OUTPUT_BY_MODEL["gpt-image-1.5"];
    this.client = new OpenAI({
      apiKey,
      ...(fetchFn ? { fetch: fetchFn as unknown as OpenAIClientOptions["fetch"] } : {}),
    });
  }

  async generate(input: ImageInput): Promise<ImageResult> {
    const ms = input.modelSettings ?? {};
    const editUrls = input.mediaInputs?.edit ?? (input.imageUrl ? [input.imageUrl] : []);
    const imageUrl = editUrls[0];
    const quality = (ms.quality as string | undefined) ?? "medium";
    const size = (ms.size as string | undefined) ?? "1024x1024";
    const outputFormat = (ms.output_format as string | undefined) ?? "png";
    const outputCompression = ms.output_compression as number | undefined;
    const background = ms.background as string | undefined;
    const moderation = ms.moderation as string | undefined;

    logCall(this.modelId, imageUrl ? "edit" : "generate", {
      quality,
      size,
      output_format: outputFormat,
      has_image: !!imageUrl,
    });

    const baseParams = {
      model: this.modelId,
      prompt: input.prompt,
      n: 1 as const,
      // gpt-image-2 accepts arbitrary resolutions within the documented constraints
      // (multiple of 16, ratio ≤ 3:1, total px 655 360 – 8 294 400). We rely on
      // model-config validation upstream and pass the raw string through.
      size: size as "1024x1024" | "1024x1536" | "1536x1024",
      quality: quality as "low" | "medium" | "high",
      output_format: outputFormat as "png" | "jpeg" | "webp",
      ...(outputCompression !== undefined && { output_compression: outputCompression }),
    };

    let b64: string | null | undefined;
    let usage: GptImageUsage | undefined;

    try {
      if (editUrls.length > 0) {
        // Image-to-image via Images Edit API — supports up to 4 reference images.
        const refUrls = editUrls.slice(0, 4);
        const imageFiles = await Promise.all(
          refUrls.map(async (url, idx) => {
            const imgResp = await fetch(url);
            if (!imgResp.ok) throw new Error(`Failed to fetch source image: ${imgResp.status}`);
            const buffer = Buffer.from(await imgResp.arrayBuffer());
            return toFile(buffer, `image-${idx}.png`, { type: "image/png" });
          }),
        );

        const response = await (
          this.client.images.edit as (
            p: unknown,
          ) => Promise<{ data: Array<{ b64_json?: string }>; usage?: GptImageUsage }>
        )({
          ...baseParams,
          image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
          ...(background && background !== "auto" && { background }),
          ...(moderation && moderation !== "auto" && { moderation }),
        });
        b64 = response.data[0]?.b64_json;
        usage = response.usage;
      } else {
        // Text-to-image via Images Generate API
        const response = await (
          this.client.images.generate as (
            p: unknown,
          ) => Promise<{ data: Array<{ b64_json?: string }>; usage?: GptImageUsage }>
        )({
          ...baseParams,
          ...(background && background !== "auto" && { background }),
          ...(moderation && moderation !== "auto" && { moderation }),
        });
        b64 = response.data[0]?.b64_json;
        usage = response.usage;
      }
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "moderation_blocked"
      ) {
        // Parse safety_violations=[foo, bar] from the error message
        const match = err.message.match(/safety_violations=\[([^\]]*)\]/);
        const violations = match?.[1] ?? "unknown";
        throw new UserFacingError(err.message, {
          key: "gptImageModerationBlocked",
          params: { violations },
        });
      }
      throw err;
    }

    if (!b64) throw new Error("gpt-image: no image data in response");

    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    const outputTokensEstimate =
      OUTPUT_TOKENS_FALLBACK[quality]?.[size] ?? OUTPUT_TOKENS_FALLBACK.medium["1024x1024"];
    const costFromUsage = computeCostFromUsage(usage, outputTokensEstimate, this.rateImageOutput);
    // Fallback: estimate using only image-output tokens + a small prompt allowance.
    const providerUsdCost =
      costFromUsage ?? outputTokensEstimate * this.rateImageOutput + 200 * RATE_TEXT_INPUT;

    return {
      url: `data:image/${ext};base64,${b64}`,
      filename: `gpt-image.${ext}`,
      base64Data: b64,
      providerUsdCost,
    };
  }
}
