import { AI_MODELS } from "@metabox/shared";
import type { ImageAdapter } from "./base.adapter.js";
export type { ImageResult } from "./base.adapter.js";
import { DalleAdapter } from "./dalle.adapter.js";
import { FalAdapter } from "./fal.adapter.js";
import { ReplicateAdapter } from "./replicate.adapter.js";
import { RecraftAdapter } from "./recraft.adapter.js";
import { GptImageAdapter } from "./gpt-image.adapter.js";
import { HiggsFieldSoulImageAdapter } from "./higgsfield.soul.adapter.js";
import { KieImageAdapter } from "./kie.adapter.js";
import type { AdapterContext } from "../with-pool.js";
import { buildProxyFetch } from "../transport/proxy-fetch.js";

/**
 * Если `ctx` передан — используем выбранный из пула ключ + (опционально) прокси.
 * FAL SDK конфигурируется глобально и не поддерживает per-instance fetch —
 * прокси для FAL на MVP игнорируется.
 */
export function createImageAdapter(modelId: string, ctx?: AdapterContext): ImageAdapter {
  const model = AI_MODELS[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const apiKey = ctx?.apiKey;
  const fetchFn = ctx ? (buildProxyFetch(ctx.proxy) ?? undefined) : undefined;

  switch (model.provider) {
    case "openai":
      if (modelId === "gpt-image-1.5") return new GptImageAdapter(apiKey, fetchFn);
      return new DalleAdapter(apiKey, fetchFn);
    case "fal":
      return new FalAdapter(modelId, apiKey, fetchFn);
    case "recraft":
      return new RecraftAdapter(modelId, apiKey, fetchFn);
    case "replicate":
    case "ideogram":
    case "midjourney":
      return new ReplicateAdapter(modelId, apiKey, fetchFn);
    case "google":
      // Imagen 4 — use Replicate mirror until direct API is available
      return new ReplicateAdapter(modelId, apiKey, fetchFn);
    case "higgsfield":
      // higgsfield использует пару apiKey + apiSecret. Из пула приходит один
      // apiKey — apiSecret берётся из env (отдельный секрет, не часть пула).
      return new HiggsFieldSoulImageAdapter(apiKey, undefined, fetchFn);
    case "kie":
      return new KieImageAdapter(modelId, apiKey, fetchFn);
    default:
      throw new Error(`No image adapter for provider: ${model.provider} (model: ${modelId})`);
  }
}
