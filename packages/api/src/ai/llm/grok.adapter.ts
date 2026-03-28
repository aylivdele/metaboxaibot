import OpenAI from "openai";
import type {
  LLMAdapter,
  LLMInput,
  LLMOutput,
  MessageRecord,
  StreamResult,
} from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

const MODEL_MAP: Record<string, string> = {
  "grok-4": "grok-4.20",
  "grok-4-fast": "grok-4-1-fast",
};

/**
 * xAI Grok adapter (db_history strategy).
 * Uses OpenAI-compatible API via xAI.
 */
export class GrokAdapter implements LLMAdapter {
  readonly contextStrategy = "db_history" as const;
  readonly contextMaxMessages: number;

  private client: OpenAI;
  private apiModel: string;

  constructor(
    private readonly modelId: string,
    contextMaxMessages = 40,
    apiKey = config.ai.grok,
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.x.ai/v1",
    });
    this.apiModel = MODEL_MAP[modelId] ?? modelId;
    this.contextMaxMessages = contextMaxMessages;
  }

  async chat(input: LLMInput): Promise<LLMOutput> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(input)) {
      chunks.push(chunk);
    }
    return { text: chunks.join(""), tokensUsed: 0 };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string, StreamResult, unknown> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
      ...(input.history ?? []).map((m: MessageRecord) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: input.prompt },
    ];

    logCall(this.apiModel, "chatStream", {
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages_count: messages.length,
      reasoning_effort: input.reasoningEffort,
    });
    const stream = await (
      this.client.chat.completions.create as (
        p: unknown,
      ) => Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>
    )({
      model: this.apiModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
      ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
    });

    let inputTokensUsed = 0;
    let outputTokensUsed = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.usage) {
        inputTokensUsed = chunk.usage.prompt_tokens;
        outputTokensUsed = chunk.usage.completion_tokens;
      }
    }

    return { inputTokensUsed, outputTokensUsed };
  }
}
