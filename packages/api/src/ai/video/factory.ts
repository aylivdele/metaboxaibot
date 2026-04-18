import type { VideoAdapter } from "./base.adapter.js";
import { FalVideoAdapter } from "./fal.adapter.js";
import { RunwayAdapter } from "./runway.adapter.js";
import { LumaAdapter } from "./luma.adapter.js";
import { HeyGenAdapter } from "./heygen.adapter.js";
import { DIDAdapter } from "./d-id.adapter.js";
import { ReplicateVideoAdapter } from "./replicate.adapter.js";
import { VeoAdapter } from "./veo.adapter.js";
import { HiggsFieldAdapter } from "./higgsfield.adapter.js";
import { AlibabaVideoAdapter } from "./alibaba.adapter.js";
import { MinimaxVideoAdapter } from "./minimax.adapter.js";
import { KieVideoAdapter } from "./kie.adapter.js";

/** FAL.ai-backed video models */
const FAL_MODELS = new Set([
  "kling",
  "kling-pro",
  "kling-motion",
  "pika",
  "seedance",
  "seedance-2",
  "seedance-2-fast",
]);

/** Replicate-backed video models */
const REPLICATE_MODELS = new Set(["sora"]);

export function createVideoAdapter(modelId: string): VideoAdapter {
  if (FAL_MODELS.has(modelId)) return new FalVideoAdapter(modelId);
  if (REPLICATE_MODELS.has(modelId)) return new ReplicateVideoAdapter(modelId);

  switch (modelId) {
    case "wan":
      return new AlibabaVideoAdapter(modelId);
    case "minimax":
    case "hailuo":
    case "hailuo-fast":
      return new MinimaxVideoAdapter(modelId);
    case "runway":
      return new RunwayAdapter();
    case "luma-ray2":
      return new LumaAdapter(modelId);
    case "heygen":
      return new HeyGenAdapter();
    case "d-id":
      return new DIDAdapter();
    case "veo":
    case "veo-fast":
      return new VeoAdapter(modelId);
    case "higgsfield-lite":
    case "higgsfield":
    case "higgsfield-preview":
      return new HiggsFieldAdapter(modelId);
    case "grok-imagine":
      return new KieVideoAdapter(modelId);
    default:
      throw new Error(`Unknown video model: ${modelId}`);
  }
}
