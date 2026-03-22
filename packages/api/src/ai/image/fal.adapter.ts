import { fal } from "@fal-ai/client";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const MODEL_ENDPOINTS: Record<string, string> = {
  flux: "fal-ai/flux/dev",
  "flux-pro": "fal-ai/flux-pro/v1.1",
  "recraft-v3": "fal-ai/recraft-v3",
  "stable-diffusion": "fal-ai/stable-diffusion-v3-medium",
};

/**
 * FAL.ai adapter — async generation (Flux, SD via FAL).
 * Uses FAL queue for async submission + polling.
 */
export class FalAdapter implements ImageAdapter {
  readonly isAsync = true;

  constructor(
    readonly modelId: string,
    apiKey = config.ai.fal,
  ) {
    fal.config({ credentials: apiKey });
  }

  private get endpoint(): string {
    return MODEL_ENDPOINTS[this.modelId] ?? `fal-ai/${this.modelId}`;
  }

  async submit(input: ImageInput): Promise<string> {
    const { request_id } = await fal.queue.submit(this.endpoint, {
      input: {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt,
        image_size: this.resolveSize(input),
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
      },
    });
    return request_id;
  }

  async poll(requestId: string): Promise<ImageResult | null> {
    const status = await fal.queue.status(this.endpoint, {
      requestId,
      logs: false,
    });

    if (status.status !== "COMPLETED") return null;

    const result = await fal.queue.result(this.endpoint, { requestId });
    const images = (result.data as { images?: Array<{ url: string }> }).images;
    const url = images?.[0]?.url;
    if (!url) throw new Error("FAL returned no image URL");
    return { url, filename: `${this.modelId}.png` };
  }

  private resolveSize(input: ImageInput): string {
    const FAL_SIZES: Record<string, string> = {
      "1:1": "square_hd",
      "4:3": "landscape_4_3",
      "3:4": "portrait_4_3",
      "16:9": "landscape_16_9",
      "9:16": "portrait_16_9",
    };
    if (input.aspectRatio && FAL_SIZES[input.aspectRatio]) {
      return FAL_SIZES[input.aspectRatio];
    }
    // Legacy fallback: derive from explicit dimensions
    if (input.width && input.height) {
      const ratio = input.width / input.height;
      if (ratio > 1.4) return "landscape_16_9";
      if (ratio < 0.7) return "portrait_16_9";
    }
    return "square_hd";
  }
}
