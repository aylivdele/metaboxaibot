import Replicate from "replicate";
import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

/**
 * Replicate-backed video adapter.
 * Used for: sora (OpenAI via Replicate), veo (Google via Replicate).
 */
const REPLICATE_MODELS: Record<string, `${string}/${string}:${string}` | `${string}/${string}`> = {
  sora: "openai/sora",
  veo: "google/veo-2",
};

export class ReplicateVideoAdapter implements VideoAdapter {
  private client: Replicate;

  constructor(
    readonly modelId: string,
    apiToken = config.ai.replicate,
  ) {
    this.client = new Replicate({ auth: apiToken });
  }

  private get model(): `${string}/${string}` | `${string}/${string}:${string}` {
    return REPLICATE_MODELS[this.modelId] ?? (`replicate/${this.modelId}` as `${string}/${string}`);
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const msExtras: Record<string, unknown> = {};
    if (ms.negative_prompt) msExtras.negative_prompt = ms.negative_prompt;
    if (ms.seed != null) msExtras.seed = ms.seed;
    const prediction = await this.client.predictions.create({
      model: this.model as `${string}/${string}`,
      input: {
        prompt: input.prompt,
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
        ...(input.duration ? { duration: input.duration } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...msExtras,
      },
    });
    return prediction.id;
  }

  async poll(predictionId: string): Promise<VideoResult | null> {
    const prediction = await this.client.predictions.get(predictionId);

    if (prediction.status === "failed") {
      throw new Error(`Replicate ${this.modelId} failed: ${String(prediction.error)}`);
    }
    if (prediction.status !== "succeeded") return null;

    const output = prediction.output;
    const url =
      typeof output === "string"
        ? output
        : Array.isArray(output)
          ? (output[0] as string)
          : undefined;

    if (!url) throw new Error(`Replicate ${this.modelId}: no output URL`);
    return { url, filename: `${this.modelId}.mp4` };
  }
}
