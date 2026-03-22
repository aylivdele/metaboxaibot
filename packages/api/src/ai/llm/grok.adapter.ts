import OpenAI from "openai";
import type {
  LLMAdapter,
  LLMInput,
  LLMOutput,
  MessageRecord,
  StreamResult,
} from "./base.adapter.js";
import { config } from "@metabox/shared";

const MODEL_MAP: Record<string, string> = {
  "grok-3": "grok-3",
  "grok-3-mini": "grok-3-mini",
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
      ...(input.history ?? []).map((m: MessageRecord) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: input.prompt },
    ];

    const stream = await this.client.chat.completions.create({
      model: this.apiModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
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
