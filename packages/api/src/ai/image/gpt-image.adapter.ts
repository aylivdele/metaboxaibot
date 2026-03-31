import OpenAI, { toFile } from "openai";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/** USD cost per image by quality × size. */
const COST_TABLE: Record<string, Record<string, number>> = {
  low: { "1024x1024": 0.009, "1024x1536": 0.013, "1536x1024": 0.013 },
  medium: { "1024x1024": 0.034, "1024x1536": 0.05, "1536x1024": 0.05 },
  high: { "1024x1024": 0.133, "1024x1536": 0.2, "1536x1024": 0.2 },
};

/**
 * GPT Image adapter — uses OpenAI Images API.
 * Returns raw base64 data (no public URL) so generation.service uploads to S3.
 */
export class GptImageAdapter implements ImageAdapter {
  readonly modelId = "gpt-image-1.5";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = config.ai.openai) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: ImageInput): Promise<ImageResult> {
    const ms = input.modelSettings ?? {};
    const quality = (ms.quality as string | undefined) ?? "medium";
    const size = (ms.size as string | undefined) ?? "1024x1024";
    const outputFormat = (ms.output_format as string | undefined) ?? "png";
    const outputCompression = ms.output_compression as number | undefined;
    const background = ms.background as string | undefined;
    const moderation = ms.moderation as string | undefined;

    logCall("gpt-image-1.5", input.imageUrl ? "edit" : "generate", {
      quality,
      size,
      output_format: outputFormat,
      has_image: !!input.imageUrl,
    });

    const baseParams = {
      model: "gpt-image-1.5" as const,
      prompt: input.prompt,
      n: 1 as const,
      size: size as "1024x1024" | "1024x1536" | "1536x1024",
      quality: quality as "low" | "medium" | "high",
      output_format: outputFormat as "png" | "jpeg" | "webp",
      ...(outputCompression !== undefined && { output_compression: outputCompression }),
      response_format: "b64_json" as const,
    };

    let b64: string | null | undefined;

    if (input.imageUrl) {
      // Image-to-image via Images Edit API
      const imgResp = await fetch(input.imageUrl);
      if (!imgResp.ok) throw new Error(`Failed to fetch source image: ${imgResp.status}`);
      const buffer = Buffer.from(await imgResp.arrayBuffer());
      const imageFile = await toFile(buffer, "image.png", { type: "image/png" });

      const response = await (
        this.client.images.edit as (p: unknown) => Promise<{ data: Array<{ b64_json?: string }> }>
      )({
        ...baseParams,
        image: imageFile,
        ...(background && background !== "auto" && { background }),
        ...(moderation && moderation !== "auto" && { moderation }),
      });
      b64 = response.data[0]?.b64_json;
    } else {
      // Text-to-image via Images Generate API
      const response = await (
        this.client.images.generate as (
          p: unknown,
        ) => Promise<{ data: Array<{ b64_json?: string }> }>
      )({
        ...baseParams,
        ...(background && background !== "auto" && { background }),
        ...(moderation && moderation !== "auto" && { moderation }),
      });
      b64 = response.data[0]?.b64_json;
    }

    if (!b64) throw new Error("gpt-image: no image data in response");

    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    const providerUsdCost = COST_TABLE[quality]?.[size] ?? COST_TABLE.medium["1024x1024"];

    return {
      url: `data:image/${ext};base64,${b64}`,
      filename: `gpt-image.${ext}`,
      base64Data: b64,
      providerUsdCost,
    };
  }
}
