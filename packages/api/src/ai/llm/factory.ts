import { AI_MODELS } from "@metabox/shared";
import type { LLMAdapter } from "./base.adapter.js";
import { OpenAIAdapter } from "./openai.adapter.js";
import { AnthropicAdapter } from "./anthropic.adapter.js";
import { GeminiAdapter } from "./gemini.adapter.js";
import { OpenAIAssistantsAdapter } from "./openai-assistants.adapter.js";
import { QwenAdapter } from "./qwen.adapter.js";

export function createLLMAdapter(modelId: string): LLMAdapter {
  const model = AI_MODELS[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  switch (model.provider) {
    case "openai":
      return new OpenAIAdapter(modelId);
    case "openai-assistants":
      return new OpenAIAssistantsAdapter(modelId);
    case "anthropic":
      return new AnthropicAdapter(modelId, model.contextMaxMessages);
    case "google":
      return new GeminiAdapter(modelId, model.contextMaxMessages);
    case "alibaba":
      return new QwenAdapter(modelId, model.contextMaxMessages);
    default:
      throw new Error(`No LLM adapter for provider: ${model.provider}`);
  }
}
