import Replicate from "replicate";
import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";
import { parseReplicatePredictionFailure } from "../../utils/replicate-error.js";

/**
 * Replicate-backed video adapter.
 * Used for: sora (OpenAI via Replicate).
 */
const REPLICATE_MODELS: Record<string, `${string}/${string}:${string}` | `${string}/${string}`> = {
  sora: "openai/sora-2",
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

    // Sora uses "seconds" (not "duration"), "input_reference" (not "image"),
    // and native aspect_ratio values "portrait"/"landscape" from model settings.
    const isSora = this.modelId === "sora";
    const predInput: Record<string, unknown> = { prompt: input.prompt };

    if (isSora) {
      if (input.imageUrl) predInput.input_reference = input.imageUrl;
      if (input.duration) predInput.seconds = input.duration;
      // aspect_ratio stored in modelSettings for Sora (portrait/landscape)
      const ar = ms.aspect_ratio as string | undefined;
      if (ar) predInput.aspect_ratio = ar;
    } else {
      if (ms.negative_prompt) predInput.negative_prompt = ms.negative_prompt;
      if (ms.seed != null) predInput.seed = ms.seed;
      if (input.imageUrl) predInput.image = input.imageUrl;
      if (input.duration) predInput.duration = input.duration;
      if (input.aspectRatio) predInput.aspect_ratio = input.aspectRatio;
    }

    logCall(String(this.model), "submit", predInput);
    const prediction = await this.client.predictions.create({
      model: this.model as `${string}/${string}`,
      input: predInput,
    });
    return prediction.id;
  }

  async poll(predictionId: string): Promise<VideoResult | null> {
    const prediction = await this.client.predictions.get(predictionId);

    if (prediction.status === "failed") {
      throw parseReplicatePredictionFailure(prediction.error, prediction.status);
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
