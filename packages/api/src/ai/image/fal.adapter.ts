import { fal } from "@fal-ai/client";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

/** Text-to-image endpoint for each model. */
const T2I_ENDPOINTS: Record<string, string> = {
  flux: "fal-ai/flux-2",
  "flux-pro": "fal-ai/flux-2-pro",
  "recraft-v3": "fal-ai/recraft-v3",
  "recraft-v4": "fal-ai/recraft/v4/text-to-image",
  "recraft-v4-pro": "fal-ai/recraft/v4/pro/text-to-image",
  "recraft-v4-vector": "fal-ai/recraft/v4/text-to-vector",
  "recraft-v4-pro-vector": "fal-ai/recraft/v4/pro/text-to-vector",
  "stable-diffusion": "fal-ai/stable-diffusion-v3-medium",
  "nano-banana-pro": "fal-ai/nano-banana-pro",
  "seedream-5": "fal-ai/bytedance/seedream/v5/lite/text-to-image",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/text-to-image",
  "gpt-image-1.5": "fal-ai/gpt-image-1.5",
};

/** Models that output SVG instead of raster images. */
const SVG_MODELS = new Set(["recraft-v4-vector", "recraft-v4-pro-vector"]);

/** Image-to-image (edit) endpoint. Falls back to the T2I endpoint when absent. */
const EDIT_ENDPOINTS: Record<string, string> = {
  "nano-banana-pro": "fal-ai/nano-banana-pro/edit",
  "seedream-5": "fal-ai/bytedance/seedream/v5/lite/edit",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/edit",
  "gpt-image-1.5": "fal-ai/gpt-image-1.5/edit",
  "stable-diffusion": "fal-ai/stable-diffusion-v3-medium/image-to-image",
  "recraft-v3": "fal-ai/recraft/v3/image-to-image",
  flux: "fal-ai/flux-2/edit",
  "flux-pro": "fal-ai/flux-2-pro/edit",
};

/** Separator used to pack endpoint+requestId into a single opaque string. */
const SEP = "||";

/**
 * FAL.ai adapter — async generation (Flux, SD, Seedream, Nano Banana, GPT Image).
 * Uses FAL queue for async submission + polling.
 *
 * The providerJobId returned by submit() encodes both the endpoint and the
 * FAL request_id so that poll() can use the exact same endpoint.
 */
export class FalAdapter implements ImageAdapter {
  readonly isAsync = true;

  constructor(
    readonly modelId: string,
    apiKey = config.ai.fal,
  ) {
    fal.config({ credentials: apiKey });
  }

  private selectEndpoint(imageUrl: string | undefined): string {
    if (imageUrl && EDIT_ENDPOINTS[this.modelId]) {
      return EDIT_ENDPOINTS[this.modelId];
    }
    return T2I_ENDPOINTS[this.modelId] ?? `fal-ai/${this.modelId}`;
  }

  async submit(input: ImageInput): Promise<string> {
    const endpoint = this.selectEndpoint(input.imageUrl);
    const ms = input.modelSettings ?? {};
    const msExtras: Record<string, unknown> = {};
    if (ms.num_inference_steps !== undefined) msExtras.num_inference_steps = ms.num_inference_steps;
    if (ms.guidance_scale !== undefined) msExtras.guidance_scale = ms.guidance_scale;
    if (ms.seed != null) msExtras.seed = ms.seed;
    if (ms.output_format) msExtras.output_format = ms.output_format;
    if (ms.style) msExtras.style = ms.style;
    if (ms.style_type) msExtras.style_type = ms.style_type;
    if (ms.magic_prompt_option) msExtras.magic_prompt_option = ms.magic_prompt_option;
    if (ms.resolution) msExtras.resolution = ms.resolution;
    const { request_id } = await fal.queue.submit(endpoint, {
      input: {
        prompt: input.prompt,
        negative_prompt: (ms.negative_prompt as string | undefined) || input.negativePrompt,
        image_size: this.resolveSize(input),
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        ...msExtras,
      },
    });
    // Encode endpoint in the returned ID so poll() uses the correct route.
    return `${endpoint}${SEP}${request_id}`;
  }

  async poll(providerJobId: string): Promise<ImageResult | null> {
    const sepIdx = providerJobId.lastIndexOf(SEP);
    const endpoint = providerJobId.slice(0, sepIdx);
    const requestId = providerJobId.slice(sepIdx + SEP.length);

    const status = await fal.queue.status(endpoint, {
      requestId,
      logs: false,
    });

    if (status.status !== "COMPLETED") return null;

    const result = await fal.queue.result(endpoint, { requestId });
    const images = (
      result.data as { images?: Array<{ url: string; width?: number; height?: number }> }
    ).images;
    const img = images?.[0];
    if (!img?.url) throw new Error("FAL returned no image URL");
    const ext = SVG_MODELS.has(this.modelId) ? "svg" : "png";
    return {
      url: img.url,
      filename: `${this.modelId}.${ext}`,
      width: img.width,
      height: img.height,
    };
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
    if (input.width && input.height) {
      const ratio = input.width / input.height;
      if (ratio > 1.4) return "landscape_16_9";
      if (ratio < 0.7) return "portrait_16_9";
    }
    return "square_hd";
  }
}
