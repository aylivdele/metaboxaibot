import type { VideoAdapter } from "./base.adapter.js";
import { FalVideoAdapter } from "./fal.adapter.js";
import { RunwayAdapter } from "./runway.adapter.js";
import { LumaAdapter } from "./luma.adapter.js";
import { HeyGenAdapter } from "./heygen.adapter.js";
import { DIDAdapter } from "./d-id.adapter.js";
import { ReplicateVideoAdapter } from "./replicate.adapter.js";
import { HiggsFieldAdapter } from "./higgsfield.adapter.js";
import { AlibabaVideoAdapter } from "./alibaba.adapter.js";

/** FAL.ai-backed video models */
const FAL_MODELS = new Set(["kling", "kling-pro", "minimax", "pika", "hailuo", "seedance"]);

/** Replicate-backed video models */
const REPLICATE_MODELS = new Set(["sora", "veo"]);

export function createVideoAdapter(modelId: string): VideoAdapter {
  if (FAL_MODELS.has(modelId)) return new FalVideoAdapter(modelId);
  if (REPLICATE_MODELS.has(modelId)) return new ReplicateVideoAdapter(modelId);

  switch (modelId) {
    case "wan":
      return new AlibabaVideoAdapter(modelId);
    case "runway":
      return new RunwayAdapter();
    case "luma":
    case "luma-ray2":
      return new LumaAdapter(modelId);
    case "heygen":
      return new HeyGenAdapter();
    case "d-id":
      return new DIDAdapter();
    case "higgsfield":
      return new HiggsFieldAdapter();
    default:
      throw new Error(`Unknown video model: ${modelId}`);
  }
}
