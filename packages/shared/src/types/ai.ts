import type { Section } from "./user.js";
import type { ContextStrategy } from "./dialog.js";

export interface AIModel {
  id: string;
  name: string;
  section: Section;
  provider: string;
  costPerRequest: number;      // в токенах (базовая стоимость)
  supportsImages: boolean;
  supportsVoice: boolean;
  supportsWeb: boolean;        // выход в интернет
  isAsync: boolean;            // требует очереди (для image/video/audio)
  contextStrategy: ContextStrategy;
  contextMaxMessages: number;  // актуально для db_history: сколько сообщений отправлять
}

/** Входные данные для LLM-чата (с учётом стратегии контекста) */
export interface ChatInput {
  prompt: string;
  imageUrl?: string;
  audioUrl?: string;
  // db_history: передаём историю из БД
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  // provider_chain: передаём ID предыдущего ответа (OpenAI Responses API)
  previousResponseId?: string;
  // provider_thread: передаём ID треда (OpenAI Assistants)
  threadId?: string;
  options?: Record<string, unknown>;
}

/** Результат LLM-чата */
export interface ChatOutput {
  text: string;
  tokensUsed: number;
  // Возвращаем для обновления Dialog
  newResponseId?: string;   // provider_chain: сохранить как providerLastResponseId
  newThreadId?: string;     // provider_thread: при первом вызове (создание Thread)
  newMessageId?: string;    // provider_thread: id сообщения ассистента
}

/** Входные данные для async-генерации (image/video/audio) */
export interface GenerationInput {
  prompt: string;
  imageUrl?: string;
  options?: Record<string, unknown>;
}

/** Результат async-генерации */
export interface GenerationOutput {
  mediaUrl: string;
  tokensUsed: number;
}
