import { fal } from "@fal-ai/client";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/** Text-to-image endpoint for each model. */
const T2I_ENDPOINTS: Record<string, string> = {
  flux: "fal-ai/flux-2",
  "flux-pro": "fal-ai/flux-2-pro",
  "stable-diffusion": "fal-ai/stable-diffusion-v3-medium",
  "seedream-5": "fal-ai/bytedance/seedream/v5/lite/text-to-image",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/text-to-image",
};

/** Image-to-image (edit) endpoint. Falls back to the T2I endpoint when absent. */
const EDIT_ENDPOINTS: Record<string, string> = {
  "seedream-5": "fal-ai/bytedance/seedream/v5/lite/edit",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/edit",
  "stable-diffusion": "fal-ai/stable-diffusion-v3-medium/image-to-image",
  flux: "fal-ai/flux-2/edit",
  "flux-pro": "fal-ai/flux-2-pro/edit",
};

/**
 * Models that accept a raw `aspect_ratio` string (e.g. "16:9") instead of
 * the standard FAL `image_size` enum (e.g. "landscape_16_9").
 */
const ASPECT_RATIO_MODELS = new Set<string>();

/**
 * Edit endpoints for these models expect `image_urls` (array) instead of `image_url` (string).
 */
const IMAGE_URLS_ARRAY_MODELS = new Set(["flux", "flux-pro", "seedream-4.5", "seedream-5"]);

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

  // FAL SDK не позволяет per-instance подменять fetch (singleton config),
  // поэтому прокси на MVP не поддерживается — fetchFn принимается ради
  // совместимости с factory, но игнорируется.
  constructor(
    readonly modelId: string,
    apiKey = config.ai.fal,
    _fetchFn?: typeof globalThis.fetch,
  ) {
    fal.config({ credentials: apiKey });
  }

  private selectEndpoint(input: ImageInput): string {
    const hasEditMedia = !!(input.mediaInputs?.edit?.length || input.imageUrl);
    if (hasEditMedia && EDIT_ENDPOINTS[this.modelId]) {
      return EDIT_ENDPOINTS[this.modelId];
    }
    return T2I_ENDPOINTS[this.modelId] ?? `fal-ai/${this.modelId}`;
  }

  async submit(input: ImageInput): Promise<string> {
    const editUrls = input.mediaInputs?.edit ?? (input.imageUrl ? [input.imageUrl] : []);
    const imageUrl = editUrls[0];
    const endpoint = this.selectEndpoint(input);
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
    if (ms.enable_web_search != null) msExtras.enable_web_search = ms.enable_web_search;
    if (ms.thinking_level) msExtras.thinking_level = ms.thinking_level;
    if (ms.acceleration) msExtras.acceleration = ms.acceleration;
    if (ms.enable_prompt_expansion != null)
      msExtras.enable_prompt_expansion = ms.enable_prompt_expansion;

    const useAspectRatio = ASPECT_RATIO_MODELS.has(this.modelId);
    const falInput = {
      prompt: input.prompt,
      negative_prompt: (ms.negative_prompt as string | undefined) || input.negativePrompt,
      ...(useAspectRatio
        ? { aspect_ratio: input.aspectRatio ?? "1:1" }
        : { image_size: this.resolveSize(input) }),
      ...(imageUrl
        ? IMAGE_URLS_ARRAY_MODELS.has(this.modelId)
          ? { image_urls: editUrls }
          : { image_url: imageUrl }
        : {}),
      ...msExtras,
    };
    logCall(endpoint, "submit", falInput as Record<string, unknown>);
    const { request_id } = await fal.queue.submit(endpoint, { input: falInput });
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
      result.data as {
        images?: Array<{
          url: string;
          width?: number;
          height?: number;
          content_type?: string;
          file_name?: string;
        }>;
      }
    ).images;
    const img = images?.[0];
    if (!img?.url) throw new Error("FAL returned no image URL");
    const contentType = img.content_type ?? "image/png";
    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    return {
      url: img.url,
      filename: img.file_name ?? `${this.modelId}.${ext}`,
      contentType,
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
