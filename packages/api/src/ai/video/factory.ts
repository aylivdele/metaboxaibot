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
import { buildProxyFetch } from "../transport/proxy-fetch.js";
import type { AdapterContext } from "../with-pool.js";

/** FAL.ai-backed video models */
const FAL_MODELS = new Set(["pika", "seedance"]);

/** Replicate-backed video models */
const REPLICATE_MODELS = new Set(["sora"]);

export function createVideoAdapter(modelId: string, ctx?: AdapterContext): VideoAdapter {
  const apiKey = ctx?.apiKey;
  const fetchFn = ctx ? (buildProxyFetch(ctx.proxy) ?? undefined) : undefined;

  if (FAL_MODELS.has(modelId)) return new FalVideoAdapter(modelId, apiKey, fetchFn);
  if (REPLICATE_MODELS.has(modelId)) return new ReplicateVideoAdapter(modelId, apiKey, fetchFn);

  switch (modelId) {
    case "wan":
      return new AlibabaVideoAdapter(modelId, apiKey, fetchFn);
    case "minimax":
    case "hailuo":
    case "hailuo-fast":
      return new MinimaxVideoAdapter(modelId, apiKey, fetchFn);
    case "runway":
      return new RunwayAdapter(apiKey, fetchFn);
    case "luma-ray2":
      return new LumaAdapter(modelId, apiKey, fetchFn);
    case "heygen":
      return new HeyGenAdapter(apiKey, undefined, fetchFn);
    case "d-id":
      return new DIDAdapter(apiKey, undefined, fetchFn);
    case "veo":
    case "veo-fast":
      return new VeoAdapter(modelId, apiKey, fetchFn);
    case "higgsfield-lite":
    case "higgsfield":
    case "higgsfield-preview":
      return new HiggsFieldAdapter(modelId, apiKey, undefined, fetchFn);
    case "grok-imagine":
    case "seedance-2":
    case "seedance-2-fast":
    case "kling":
    case "kling-pro":
    case "kling-motion":
    case "kling-motion-pro":
      return new KieVideoAdapter(modelId, apiKey, fetchFn);
    default:
      throw new Error(`Unknown video model: ${modelId}`);
  }
}
