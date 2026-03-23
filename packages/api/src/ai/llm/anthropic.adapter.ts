import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMAdapter,
  LLMInput,
  LLMOutput,
  MessageRecord,
  StreamResult,
} from "./base.adapter.js";
import { config } from "@metabox/shared";

const MODEL_MAP: Record<string, string> = {
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-haiku": "claude-haiku-4-5-20251001",
  "claude-opus": "claude-opus-4-6",
  "claude-opus-4-5": "claude-opus-4-5",
  "claude-sonnet-4-5": "claude-sonnet-4-5-20251001",
};

/**
 * Anthropic Claude adapter (db_history strategy).
 * Sends the last N messages from DB with each request.
 */
export class AnthropicAdapter implements LLMAdapter {
  readonly contextStrategy = "db_history" as const;
  readonly contextMaxMessages: number;

  private client: Anthropic;
  private apiModel: string;

  constructor(
    private readonly modelId: string,
    contextMaxMessages = 50,
    apiKey = config.ai.anthropic,
  ) {
    this.client = new Anthropic({ apiKey });
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
    const messages = this.buildMessages(input);
    const stream = this.client.messages.stream({
      model: this.apiModel,
      max_tokens: 4096,
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      messages,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      } else if (event.type === "message_start") {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === "message_delta") {
        outputTokens = event.usage.output_tokens;
      }
    }

    return { inputTokensUsed: inputTokens, outputTokensUsed: outputTokens };
  }

  private buildMessages(input: LLMInput): Anthropic.MessageParam[] {
    const history: Anthropic.MessageParam[] = (input.history ?? []).map((m: MessageRecord) => ({
      role: m.role,
      content: m.content,
    }));

    const userContent: Anthropic.MessageParam["content"] = input.imageUrl
      ? [
          { type: "image", source: { type: "url", url: input.imageUrl } },
          { type: "text", text: input.prompt },
        ]
      : input.prompt;

    return [...history, { role: "user", content: userContent }];
  }
}
