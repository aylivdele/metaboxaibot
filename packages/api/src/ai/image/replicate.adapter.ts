import Replicate from "replicate";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";

const MODEL_VERSIONS: Record<string, string> = {
  "stable-diffusion": "stability-ai/sdxl:39ed52f2319f9b0e",
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
    apiKey = process.env.REPLICATE_API_KEY,
  ) {
    this.client = new Replicate({ auth: apiKey });
  }

  async submit(input: ImageInput): Promise<string> {
    const model = MODEL_VERSIONS[this.modelId] ?? this.modelId;
    const prediction = await this.client.predictions.create({
      model,
      input: {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt,
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
      },
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
