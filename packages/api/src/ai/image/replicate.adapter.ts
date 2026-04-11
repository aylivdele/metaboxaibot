import Replicate from "replicate";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";
import { parseReplicatePredictionFailure } from "../../utils/replicate-error.js";
import { resolveImageMimeType } from "../../utils/mime-detect.js";

/**
 * Models that accept a raw `aspect_ratio` string (e.g. "16:9") instead of
 * explicit width/height dimensions.
 */
const DIRECT_ASPECT_RATIO_MODELS = new Set([
  "midjourney",
  "stable-diffusion",
  "imagen-4",
  "imagen-4-fast",
  "imagen-4-ultra",
]);

/**
 * Maps modelId → Replicate model string.
 * Format "owner/name" → SDK calls POST /v1/models/{owner}/{name}/predictions (latest deployment).
 * Format "owner/name:sha256hash" → SDK calls POST /v1/predictions with { version: hash }.
 */
const MODEL_IDS: Record<string, string> = {
  // Use deployment endpoint (no pinned version) — always resolves to latest published version
  "stable-diffusion": "stability-ai/stable-diffusion-3.5-large",
  "ideogram-quality": "ideogram-ai/ideogram-v3-quality",
  "ideogram-balanced": "ideogram-ai/ideogram-v3-balanced",
  "ideogram-turbo": "ideogram-ai/ideogram-v3-turbo",
  midjourney:
    "adminconteudosflix/midjourney-allcraft:40ab9b32cc4584bc069e22027fffb97e79ed550d4e7c20ed6d5d7ef89e8f08f5",
  "imagen-4-fast": "google/imagen-4-fast",
  "imagen-4": "google/imagen-4",
  "imagen-4-ultra": "google/imagen-4-ultra",
};

/** Ideogram model IDs — accept `style_reference_images` array instead of `image`. */
const IDEOGRAM_MODELS = new Set(["ideogram-quality", "ideogram-balanced", "ideogram-turbo"]);

/**
 * Replicate adapter — async image generation.
 * Covers Stable Diffusion (SDXL), Ideogram, and Midjourney-style models.
 */
export class ReplicateAdapter implements ImageAdapter {
  readonly isAsync = true;

  private client: Replicate;

  constructor(
    readonly modelId: string,
    apiKey = config.ai.replicate,
  ) {
    this.client = new Replicate({ auth: apiKey });
  }

  private resolveSize(input: ImageInput): { width: number; height: number } {
    // Aspect ratio → nearest clean dimensions at ~1024px long-side (multiples of 8)
    const REPLICATE_SIZES: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1024, height: 1024 },
      "4:3": { width: 1024, height: 768 },
      "3:4": { width: 768, height: 1024 },
      "16:9": { width: 1280, height: 720 },
      "9:16": { width: 720, height: 1280 },
      "3:2": { width: 1152, height: 768 },
      "2:3": { width: 768, height: 1152 },
    };
    if (input.aspectRatio && REPLICATE_SIZES[input.aspectRatio]) {
      return REPLICATE_SIZES[input.aspectRatio];
    }
    return { width: input.width ?? 1024, height: input.height ?? 1024 };
  }

  async submit(input: ImageInput): Promise<string> {
    const modelStr = MODEL_IDS[this.modelId] ?? this.modelId;
    const ms = input.modelSettings ?? {};
    const msExtras: Record<string, unknown> = {};
    if (ms.negative_prompt) msExtras.negative_prompt = ms.negative_prompt;
    else if (input.negativePrompt) msExtras.negative_prompt = input.negativePrompt;
    if (ms.guidance_scale !== undefined) msExtras.guidance_scale = ms.guidance_scale;
    if (ms.cfg !== undefined) msExtras.cfg = ms.cfg;
    if (ms.num_inference_steps !== undefined) msExtras.num_inference_steps = ms.num_inference_steps;
    const stylePreset = ms.style_preset && ms.style_preset !== "None" ? ms.style_preset : undefined;
    if (stylePreset) msExtras.style_preset = stylePreset;
    // Ideogram constraint: when style_preset, style_codes, or style_reference_images
    // is used, style_type must be Auto or General. A reference image sent by the
    // user becomes style_reference_images further down, so detect that here too.
    const ideogramHasStyleRef =
      IDEOGRAM_MODELS.has(this.modelId) && (!!stylePreset || !!input.imageUrl);
    if (ms.style_type && ms.style_type !== "None") {
      const styleType = ms.style_type as string;
      msExtras.style_type =
        ideogramHasStyleRef && styleType !== "Auto" && styleType !== "General" ? "Auto" : styleType;
    } else if (ideogramHasStyleRef) {
      msExtras.style_type = "Auto";
    }
    if (ms.magic_prompt_option) msExtras.magic_prompt_option = ms.magic_prompt_option;
    if (ms.go_fast !== undefined) msExtras.go_fast = ms.go_fast;
    if (ms.output_format) msExtras.output_format = ms.output_format;
    if (ms.output_quality !== undefined) msExtras.output_quality = ms.output_quality;
    // prompt_strength is img2img-only — skip for text-to-image to avoid API rejection
    if (ms.prompt_strength !== undefined && input.imageUrl)
      msExtras.prompt_strength = ms.prompt_strength;
    if (ms.lora_scale !== undefined) msExtras.lora_scale = ms.lora_scale;
    if (ms.extra_lora) msExtras.extra_lora = ms.extra_lora;
    if (ms.extra_lora_scale !== undefined) msExtras.extra_lora_scale = ms.extra_lora_scale;
    if (ms.seed != null) msExtras.seed = ms.seed;
    if (ms.disable_safety_checker !== undefined)
      msExtras.disable_safety_checker = ms.disable_safety_checker;
    if (ms.model) msExtras.model = ms.model;
    if (ms.image_size) msExtras.image_size = ms.image_size;
    if (ms.safety_filter_level) msExtras.safety_filter_level = ms.safety_filter_level;

    const useDirectAspectRatio =
      DIRECT_ASPECT_RATIO_MODELS.has(this.modelId) || IDEOGRAM_MODELS.has(this.modelId);
    const aspectRatio = input.aspectRatio ?? "1:1";
    // For ideogram: resolution setting overrides aspect_ratio when set
    const resolution =
      IDEOGRAM_MODELS.has(this.modelId) && ms.resolution && ms.resolution !== "None"
        ? (ms.resolution as string)
        : undefined;
    const sizeParams: Record<string, unknown> = resolution
      ? { resolution }
      : useDirectAspectRatio
        ? aspectRatio === "custom"
          ? { width: ms.width ?? 1024, height: ms.height ?? 1024 }
          : { aspect_ratio: aspectRatio }
        : this.resolveSize(input);

    // Download image and pass as Blob — Replicate cannot fetch Telegram/S3 presigned URLs directly.
    let imageParam: Record<string, unknown> = {};
    if (input.imageUrl) {
      const imgRes = await fetch(input.imageUrl);
      if (imgRes.ok) {
        const imgBuf = await imgRes.arrayBuffer();
        const mimeType = resolveImageMimeType(imgBuf, imgRes.headers.get("content-type"));
        const blob = new Blob([imgBuf], { type: mimeType });
        imageParam = IDEOGRAM_MODELS.has(this.modelId)
          ? { style_reference_images: [blob] }
          : { image: blob };
      } else {
        // Fall back to URL if download fails (non-critical)
        imageParam = IDEOGRAM_MODELS.has(this.modelId)
          ? { style_reference_images: [input.imageUrl] }
          : { image: input.imageUrl };
      }
    }

    const predInput = {
      prompt: input.prompt,
      ...sizeParams,
      ...imageParam,
      ...msExtras,
    };

    logCall(modelStr, "submit", predInput);
    // "owner/name:sha256hash" → pass version hash directly (POST /v1/predictions)
    // "owner/name"            → pass as model (POST /v1/models/{owner}/{name}/predictions)
    const colonIdx = modelStr.indexOf(":");
    const prediction =
      colonIdx !== -1
        ? await this.client.predictions.create({
            version: modelStr.slice(colonIdx + 1),
            input: predInput,
          })
        : await this.client.predictions.create({
            model: modelStr as `${string}/${string}`,
            input: predInput,
          });

    return prediction.id;
  }

  async poll(predictionId: string): Promise<ImageResult | null> {
    const prediction = await this.client.predictions.get(predictionId);

    if (prediction.status === "succeeded") {
      const output = prediction.output as string[] | string | undefined;
      const url = Array.isArray(output) ? output[0] : output;
      if (!url) throw new Error("Replicate returned no image URL");
      // Detect format from URL (Replicate URLs end with .png, .jpg, .webp, etc.)
      const urlExt = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "png";
      const contentType = urlExt === "jpg" || urlExt === "jpeg" ? "image/jpeg" : `image/${urlExt}`;
      return { url, filename: `${this.modelId}.${urlExt}`, contentType };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw parseReplicatePredictionFailure(prediction.error, prediction.status);
    }

    return null; // still processing
  }
}
