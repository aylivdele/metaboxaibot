import { AI_MODELS, config } from "@metabox/shared";
import type { AIModel } from "@metabox/shared";

/**
 * Резолвит, ключ какого провайдера нужен для конкретной модели.
 *
 * `model.provider` — это бренд (midjourney, ideogram, …), а реально запрос
 * летит на API агрегатора (Replicate, KIE, APIPass). Здесь мы маппим бренд
 * на провайдера API-ключа, который должен быть в пуле/env.
 *
 * Используется как KeyPool.acquireKey, так и env-fallback.
 */
export function resolveKeyProvider(modelId: string): string {
  const model = AI_MODELS[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return resolveKeyProviderForModel(model);
}

/**
 * То же что `resolveKeyProvider`, но принимает уже найденный AIModel объект.
 * Нужен для fallback-моделей: у fallback тот же `id` что у primary, но другой
 * `provider`. Lookup по id вернул бы primary вместо fallback — для key-pool
 * resolution это критично.
 */
export function resolveKeyProviderForModel(model: AIModel): string {
  const { section, provider } = model;

  if (section === "design") {
    if (provider === "ideogram" || provider === "midjourney") return "replicate";
    if (provider === "google") return "replicate"; // Imagen → Replicate mirror
  }
  if (provider === "suno") return "apipass";
  if (provider === "xai") return "grok"; // env-переменная — GROK_API_KEY
  if (provider === "kie-claude") return "kie"; // Claude через kie использует общий kie-ключ

  return provider;
}

/**
 * Достаёт ключ провайдера из env (config.ai). Возвращает undefined если не задан.
 *
 * Используется как fallback, когда в БД нет активных ProviderKey записей
 * для этого провайдера.
 */
export function envKeyForProvider(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return config.ai.openai;
    case "anthropic":
      return config.ai.anthropic;
    case "google":
      return config.ai.google;
    case "alibaba":
      return config.ai.alibaba;
    case "grok":
      return config.ai.grok;
    case "deepseek":
      return config.ai.deepseek;
    case "perplexity":
      return config.ai.perplexity;
    case "fal":
      return config.ai.fal;
    case "replicate":
      return config.ai.replicate;
    case "runway":
      return config.ai.runway;
    case "luma":
      return config.ai.luma;
    case "elevenlabs":
      return config.ai.elevenlabs;
    case "heygen":
      return config.ai.heygen;
    case "did":
      return config.ai.did;
    case "higgsfield":
      return config.ai.higgsfieldApiKey;
    case "higgsfield_soul": {
      // Higgsfield Soul требует пару key:secret. Пул хранит её одной строкой
      // в keyValue (admin вводит "apiKey:apiSecret"). Env-fallback собираем
      // из двух переменных окружения. Если хоть одна не задана — undefined.
      const k = config.ai.higgsfieldApiKey;
      const s = config.ai.higgsfieldApiSecret;
      return k && s ? `${k}:${s}` : undefined;
    }
    case "apipass":
      return config.ai.apipass;
    case "recraft":
      return config.ai.recraft;
    case "minimax":
      return config.ai.minimax;
    case "kie":
      return config.ai.kie;
    default:
      return undefined;
  }
}
