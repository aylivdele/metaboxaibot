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
  /** One or more image URLs to include in the user turn. */
  imageUrls?: string[];
  /** provider_chain: OpenAI Responses API — chains via previous_response_id */
  previousResponseId?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Sampling temperature (0–2). Provider default when omitted. */
  temperature?: number;
  /** Max output tokens. Provider default when omitted. */
  maxTokens?: number;
  /** Perplexity: restrict search results to a time window (month/week/day/hour). */
  searchRecencyFilter?: string;
}

export interface LLMOutput {
  text: string;
  tokensUsed: number;
  /** provider_chain: save as Dialog.providerLastResponseId */
  newResponseId?: string;
}

export interface StreamResult {
  newResponseId?: string;
  /** Raw provider input token count (API tokens, not internal credits). */
  inputTokensUsed?: number;
  /** Raw provider output token count (API tokens, not internal credits). */
  outputTokensUsed?: number;
  /**
   * If set, overrides calculateCost() — adapter computed the exact USD cost
   * directly from provider-specific usage fields (e.g. citation/search tokens).
   */
  providerUsdCost?: number;
}

export interface LLMAdapter {
  readonly contextStrategy: ContextStrategy;
  readonly contextMaxMessages: number;
  chat(input: LLMInput): Promise<LLMOutput>;
  chatStream(input: LLMInput): AsyncGenerator<string, StreamResult | void, unknown>;
}
