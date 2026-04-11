import type { ContextStrategy } from "@metabox/shared";

export interface MessageAttachment {
  /** S3 key of the stored file (persisted in DB). */
  s3Key: string;
  mimeType: string;
  name: string;
  size?: number;
  /** Presigned GET URL — populated by the chat service just before the adapter call. */
  url?: string;
}

export interface MessageRecord {
  /** Optional DB message id — needed so adapters can look up historyAttachments. */
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** Documents attached to this historical message (reattached at every send). */
  attachments?: MessageAttachment[];
}

export interface LLMInput {
  prompt: string;
  imageUrl?: string;
  /** db_history: last N messages from DB */
  history?: MessageRecord[];
  /** One or more image URLs to include in the user turn. */
  imageUrls?: string[];
  /**
   * Documents attached to the current user turn. Each entry holds the s3Key
   * plus mime/name metadata — adapters presign GET URLs just before sending.
   */
  documentAttachments?: MessageAttachment[];
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
  /** Perplexity: depth of web search context (low/medium/high). */
  searchContextSize?: string;
  /** Perplexity: comma-separated domain allowlist (e.g. "wikipedia.org,bbc.com"). */
  searchDomainFilter?: string;
  /** OpenAI o-series / gpt-5: reasoning effort (none/low/medium/high/xhigh). */
  reasoningEffort?: string;
  /** OpenAI gpt-5 family: output verbosity hint (low/medium/high). Passed as text.verbosity. */
  verbosity?: string;
  /** Anthropic: enable extended thinking mode. */
  extendedThinking?: boolean;
  /** Qwen3: enable chain-of-thought thinking (true by default for thinking models). */
  enableThinking?: boolean;
  /** Gemini: internal reasoning token budget (0 = disabled). */
  thinkingBudget?: number;
  /** OpenAI chat models: seed for reproducible outputs. */
  seed?: number;
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
