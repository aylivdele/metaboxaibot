import Anthropic from "@anthropic-ai/sdk";
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
    logCall(this.apiModel, "chatStream", {
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages_count: messages.length,
      extended_thinking: input.extendedThinking,
    });
    // Extended thinking requires a higher max_tokens budget (must exceed budget_tokens).
    const maxTokens = input.extendedThinking
      ? Math.max(input.maxTokens ?? 16000, 16000)
      : (input.maxTokens ?? 4096);
    const stream = (
      this.client.messages.stream as (p: unknown) => ReturnType<typeof this.client.messages.stream>
    )({
      model: this.apiModel,
      max_tokens: maxTokens,
      ...(input.temperature !== undefined && !input.extendedThinking
        ? { temperature: input.temperature }
        : {}),
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      ...(input.extendedThinking ? { thinking: { type: "enabled", budget_tokens: 10000 } } : {}),
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
    // Historical messages may carry attachments (PDFs) that need to be
    // re-sent as `document` blocks on every request. User explicitly chose
    // "resend every time" over "only current message" for quality.
    const history: Anthropic.MessageParam[] = (input.history ?? []).map((m: MessageRecord) => {
      const docs = (m.attachments ?? []).filter((a) => !!a.url);
      if (docs.length === 0) return { role: m.role, content: m.content };

      const blocks: Anthropic.ContentBlockParam[] = [
        ...docs.map(
          (d) =>
            ({
              type: "document" as const,
              source: { type: "url" as const, url: d.url! },
            }) as Anthropic.ContentBlockParam,
        ),
        ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
      ];
      return { role: m.role, content: blocks };
    });

    const urls = input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [];
    const docs = (input.documentAttachments ?? []).filter((d) => !!d.url);

    const userContent: Anthropic.MessageParam["content"] =
      urls.length || docs.length
        ? [
            ...urls.map((url) => ({
              type: "image" as const,
              source: { type: "url" as const, url },
            })),
            ...docs.map(
              (d) =>
                ({
                  type: "document" as const,
                  source: { type: "url" as const, url: d.url! },
                }) as Anthropic.ContentBlockParam,
            ),
            ...(input.prompt ? [{ type: "text" as const, text: input.prompt }] : []),
          ]
        : input.prompt;

    return [...history, { role: "user", content: userContent }];
  }
}
