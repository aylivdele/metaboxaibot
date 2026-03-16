import type { ContextStrategy } from "@metabox/shared";

export interface MessageRecord {
  role: "user" | "assistant";
  content: string;
}

export interface LLMInput {
  prompt: string;
  imageUrl?: string;
  /** db_history: last N messages from DB */
  history?: MessageRecord[];
  /** provider_chain: OpenAI Responses API — chains via previous_response_id */
  previousResponseId?: string;
  /** provider_thread: OpenAI Assistants — existing thread id */
  threadId?: string;
  /** System prompt override */
  systemPrompt?: string;
}

export interface LLMOutput {
  text: string;
  tokensUsed: number;
  /** provider_chain: save as Dialog.providerLastResponseId */
  newResponseId?: string;
  /** provider_thread: returned on first call, save as Dialog.providerThreadId */
  newThreadId?: string;
}

export interface StreamResult {
  newResponseId?: string;
  newThreadId?: string;
  /** Raw provider input token count (API tokens, not internal credits). */
  inputTokensUsed?: number;
  /** Raw provider output token count (API tokens, not internal credits). */
  outputTokensUsed?: number;
}

export interface LLMAdapter {
  readonly contextStrategy: ContextStrategy;
  readonly contextMaxMessages: number;
  chat(input: LLMInput): Promise<LLMOutput>;
  chatStream(input: LLMInput): AsyncGenerator<string, StreamResult | void, unknown>;
}
