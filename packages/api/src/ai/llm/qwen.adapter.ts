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
  "qwen-max": "qwen-max",
  "qwen-3-max-thinking": "qwen3-235b-a22b",
  "qwen-3-thinking": "qwen3-30b-a3b",
  "qwen-3": "qwen3-8b",
};

/**
 * Alibaba Qwen adapter (db_history strategy).
 * Uses OpenAI-compatible API via DashScope.
 */
export class QwenAdapter implements LLMAdapter {
  readonly contextStrategy = "db_history" as const;
  readonly contextMaxMessages: number;

  private client: OpenAI;
  private apiModel: string;

  constructor(
    private readonly model: string,
    contextMaxMessages = 40,
    apiKey = config.ai.qwen,
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    this.apiModel = MODEL_MAP[model] ?? model;
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

    logCall(this.apiModel, "chatStream", {
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages_count: messages.length,
    });
    const stream = await this.client.chat.completions.create({
      model: this.apiModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
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
