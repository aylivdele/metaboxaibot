import { AI_MODELS } from "@metabox/shared";
import type { AIModel } from "@metabox/shared";
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
import { EvolinkVideoAdapter } from "./evolink.adapter.js";
import { buildProxyFetch } from "../transport/proxy-fetch.js";
import type { AdapterContext } from "../with-pool.js";

/**
 * Принимает либо строку (modelId, lookup в AI_MODELS), либо готовый AIModel
 * объект. Второй вариант нужен для fallback: у fallback-модели тот же `id`,
 * что и у primary, но другой `provider` — lookup по id вернул бы не ту запись.
 *
 * Диспетчеризация по `model.provider` — каждое значение строки одной модели
 * детерминированно мапится на конкретный класс адаптера.
 */
export function createVideoAdapter(
  modelOrId: string | AIModel,
  ctx?: AdapterContext,
): VideoAdapter {
  const apiKey = ctx?.apiKey;
  const fetchFn = ctx ? (buildProxyFetch(ctx.proxy) ?? undefined) : undefined;

  const model = typeof modelOrId === "string" ? AI_MODELS[modelOrId] : modelOrId;
  if (!model) throw new Error(`Unknown video model: ${String(modelOrId)}`);
  const modelId = model.id;

  // Legacy quirks: certain primary modelIds route to a different adapter than
  // their `provider` field would suggest. Only matched when the model is the
  // canonical primary definition (matching provider). Fallback registrations
  // for the same id with a different provider fall through to the provider
  // switch below.
  if (modelId === "pika" && model.provider === "pika") {
    return new FalVideoAdapter(modelId, apiKey, fetchFn);
  }
  if (modelId === "sora" && model.provider === "openai") {
    return new ReplicateVideoAdapter(modelId, apiKey, fetchFn);
  }

  switch (model.provider) {
    case "fal":
      return new FalVideoAdapter(modelId, apiKey, fetchFn);
    case "replicate":
      return new ReplicateVideoAdapter(modelId, apiKey, fetchFn);
    case "alibaba":
      return new AlibabaVideoAdapter(modelId, apiKey, fetchFn);
    case "minimax":
      return new MinimaxVideoAdapter(modelId, apiKey, fetchFn);
    case "runway":
      return new RunwayAdapter(apiKey, fetchFn);
    case "luma":
      return new LumaAdapter(modelId, apiKey, fetchFn);
    case "heygen":
      return new HeyGenAdapter(apiKey, undefined, fetchFn);
    case "did":
      return new DIDAdapter(apiKey, undefined, fetchFn);
    case "google":
      return new VeoAdapter(modelId, apiKey, fetchFn);
    case "higgsfield":
      return new HiggsFieldAdapter(modelId, apiKey, undefined, fetchFn);
    case "kie":
      return new KieVideoAdapter(modelId, apiKey, fetchFn);
    case "evolink":
      return new EvolinkVideoAdapter(modelId, apiKey, fetchFn);
    default:
      throw new Error(`No video adapter for provider: ${model.provider} (model: ${modelId})`);
  }
}
