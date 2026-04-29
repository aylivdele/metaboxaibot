import OpenAI, { type ClientOptions as OpenAIClientOptions } from "openai";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config, UserFacingError } from "@metabox/shared";

const DALLE_SIZES: Record<string, "1024x1024" | "1792x1024" | "1024x1792"> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
};

/** USD cost table: quality × aspect_ratio */
const DALLE_COST: Record<string, Record<string, number>> = {
  standard: { "1024x1024": 0.04, "1792x1024": 0.08, "1024x1792": 0.08 },
  hd: { "1024x1024": 0.08, "1792x1024": 0.12, "1024x1792": 0.12 },
};

/**
 * DALL-E 3 adapter — synchronous text-to-image, returns URL immediately.
 *
 * **No img2img support.** OpenAI deprecated DALL-E 2 (`createVariation`
 * endpoint вернёт 404), а у DALL-E 3 нет own image-edit/variation API.
 * Если юзер пришёл сюда с `imageUrl` (например, через legacy refine flow),
 * шлём UserFacingError → юзер выбирает другую модель (Nano Banana, FLUX и т.п.).
 */
export class DalleAdapter implements ImageAdapter {
  readonly modelId = "dall-e-3";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = config.ai.openai, fetchFn?: typeof globalThis.fetch) {
    this.client = new OpenAI({
      apiKey,
      ...(fetchFn ? { fetch: fetchFn as unknown as OpenAIClientOptions["fetch"] } : {}),
    });
  }

  async generate(input: ImageInput): Promise<ImageResult> {
    // OpenAI DALL-E 3 не имеет img2img endpoint'а; DALL-E 2 createVariation
    // deprecated (404). Любой image-input → user-facing reject с подсказкой.
    const imageUrl = input.mediaInputs?.edit?.[0] ?? input.imageUrl;
    if (imageUrl) {
      throw new UserFacingError(
        "DALL-E 3 does not support img2img — DALL-E 2 variations endpoint is deprecated",
        {
          key: "modelDoesNotSupportImg2img",
          params: { modelName: "DALL-E 3" },
        },
      );
    }

    const ms = input.modelSettings ?? {};
    const quality = (ms.quality as "standard" | "hd" | undefined) ?? "standard";
    const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "1:1";
    const size = DALLE_SIZES[aspectRatio] ?? "1024x1024";
    const providerUsdCost = DALLE_COST[quality]?.[size] ?? 0.04;

    let response;
    try {
      response = await this.client.images.generate({
        model: "dall-e-3",
        prompt: input.prompt,
        n: 1,
        size,
        quality,
        style: (ms.style as "vivid" | "natural" | undefined) ?? "vivid",
        response_format: "url",
      });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "content_policy_violation"
      ) {
        throw new UserFacingError(err.message, { key: "contentPolicyViolation", cause: err });
      }
      throw err;
    }

    const url = response.data?.[0]?.url;
    if (!url) throw new Error("DALL-E returned no image URL");
    return { url, filename: "dalle3.png", providerUsdCost };
  }
}
