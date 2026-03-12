import OpenAI from "openai";
import type { LLMAdapter, LLMInput, LLMOutput, MessageRecord } from "./base.adapter.js";

/**
 * Alibaba Qwen adapter (db_history strategy).
 * Uses OpenAI-compatible API via DashScope.
 */
export class QwenAdapter implements LLMAdapter {
  readonly contextStrategy = "db_history" as const;
  readonly contextMaxMessages: number;

  private client: OpenAI;

  constructor(
    private readonly model: string,
    contextMaxMessages = 40,
    apiKey = process.env.QWEN_API_KEY,
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    this.contextMaxMessages = contextMaxMessages;
  }

  async chat(input: LLMInput): Promise<LLMOutput> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(input)) {
      chunks.push(chunk);
    }
    return { text: chunks.join(""), tokensUsed: 0 };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      ...(input.history ?? []).map((m: MessageRecord) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: input.prompt },
    ];

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
