import Replicate from "replicate";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

/**
 * Maps modelId → Replicate model string.
 * Format "owner/name" → SDK calls POST /v1/models/{owner}/{name}/predictions (latest deployment).
 * Format "owner/name:sha256hash" → SDK calls POST /v1/predictions with { version: hash }.
 */
const MODEL_IDS: Record<string, string> = {
  // Use deployment endpoint (no pinned version) — always resolves to latest published version
  "stable-diffusion": "stability-ai/sdxl",
  ideogram: "ideogram-ai/ideogram-v2",
  midjourney:
    "tstramer/midjourney-diffusion:436b051ebd8f68d23e83d22de5e198e0995357afef113768c20f0b6fcef23c8b",
};

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
    const { width, height } = this.resolveSize(input);
    const predInput = {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt,
      width,
      height,
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
    };

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
      return { url, filename: `${this.modelId}.png` };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? ""}`);
    }

    return null; // still processing
  }
}
