import type { VideoAdapter } from "./base.adapter.js";
import { FalVideoAdapter } from "./fal.adapter.js";
import { RunwayAdapter } from "./runway.adapter.js";
import { LumaAdapter } from "./luma.adapter.js";
import { HeyGenAdapter } from "./heygen.adapter.js";
import { DIDAdapter } from "./d-id.adapter.js";
import { ReplicateVideoAdapter } from "./replicate.adapter.js";

/** FAL.ai-backed video models */
const FAL_MODELS = new Set(["kling", "minimax", "pika", "hailuo", "wan"]);

/** Replicate-backed video models */
const REPLICATE_MODELS = new Set(["sora", "veo"]);

export function createVideoAdapter(modelId: string): VideoAdapter {
  if (FAL_MODELS.has(modelId)) return new FalVideoAdapter(modelId);
  if (REPLICATE_MODELS.has(modelId)) return new ReplicateVideoAdapter(modelId);

  switch (modelId) {
    case "runway":
      return new RunwayAdapter();
    case "luma":
      return new LumaAdapter();
    case "heygen":
      return new HeyGenAdapter();
    case "d-id":
      return new DIDAdapter();
    default:
      throw new Error(`Unknown video model: ${modelId}`);
  }
}
