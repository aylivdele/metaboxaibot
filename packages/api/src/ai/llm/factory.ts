import { AI_MODELS } from "@metabox/shared";
import type { AIModel } from "@metabox/shared";
import type { LLMAdapter } from "./base.adapter.js";
import { OpenAIAdapter } from "./openai.adapter.js";
import { AnthropicAdapter } from "./anthropic.adapter.js";
import { ClaudeAnthropicProxyAdapter } from "./claude-anthropic-proxy.adapter.js";
import { GeminiAdapter } from "./gemini.adapter.js";
import { QwenAdapter } from "./qwen.adapter.js";
import { GrokAdapter } from "./grok.adapter.js";
import { DeepSeekAdapter } from "./deepseek.adapter.js";
import { PerplexityAdapter } from "./perplexity.adapter.js";
import type { AdapterContext } from "../with-pool.js";
import { buildProxyFetch } from "../transport/proxy-fetch.js";

/**
 * Если `ctx` передан — используем выбранный из пула ключ + (опционально) прокси.
 * Если `ctx` не передан — каждый адаптер падает в env-default из config.ai.*.
 *
 * Принимает либо строку (modelId, lookup в AI_MODELS), либо готовый AIModel
 * объект. Второй вариант нужен для fallback: у fallback-модели тот же `id`,
 * что и у primary, но другой `provider` — lookup по id вернул бы primary вместо
 * fallback. Mirror'ит поведение `createImageAdapter`.
 *
 * Gemini SDK (@google/genai) не поддерживает custom fetch — прокси для него
 * на MVP игнорируется (используется только apiKey).
 */
export function createLLMAdapter(modelOrId: string | AIModel, ctx?: AdapterContext): LLMAdapter {
  const model = typeof modelOrId === "string" ? AI_MODELS[modelOrId] : modelOrId;
  if (!model) throw new Error(`Unknown model: ${String(modelOrId)}`);
  const modelId = model.id;

  const apiKey = ctx?.apiKey;
  const fetchFn = ctx ? (buildProxyFetch(ctx.proxy) ?? undefined) : undefined;

  switch (model.provider) {
    case "openai":
      return new OpenAIAdapter(modelId, apiKey, fetchFn);
    case "anthropic":
      // Прямой Anthropic API. Сейчас не используется ни одной активной моделью —
      // Claude переведён на kie (с fallback на evolink). Адаптер сохранён как
      // rollback-путь: чтобы вернуть прямой Anthropic для какой-то модели,
      // поменяйте её provider в gpt.models.ts на "anthropic".
      return new AnthropicAdapter(modelId, model.contextMaxMessages, apiKey, fetchFn);
    case "kie-claude":
    case "evolink-claude":
      return new ClaudeAnthropicProxyAdapter(
        modelId,
        model.provider,
        model.contextMaxMessages,
        apiKey,
        fetchFn,
      );
    case "google":
      return new GeminiAdapter(modelId, model.contextMaxMessages, apiKey);
    case "alibaba":
      return new QwenAdapter(modelId, model.contextMaxMessages, apiKey, fetchFn);
    case "grok":
      return new GrokAdapter(modelId, model.contextMaxMessages, apiKey, fetchFn);
    case "deepseek":
      return new DeepSeekAdapter(modelId, model.contextMaxMessages, apiKey, fetchFn);
    case "perplexity":
      return new PerplexityAdapter(modelId, model.contextMaxMessages, apiKey, fetchFn);
    default:
      throw new Error(`No LLM adapter for provider: ${model.provider}`);
  }
}
