import OpenAI, { type ClientOptions as OpenAIClientOptions } from "openai";
import {
  BaseLLMAdapter,
  type LLMInput,
  type LLMOutput,
  type StreamResult,
} from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/**
 * OpenAI Responses API adapter (provider_chain strategy).
 * Uses previous_response_id to chain responses — no history transfer needed.
 */
export class OpenAIAdapter extends BaseLLMAdapter {
  readonly contextStrategy = "provider_chain" as const;
  readonly contextMaxMessages = 0;
  protected readonly modelId: string;

  private client: OpenAI;
  private model: string;

  constructor(model: string, apiKey = config.ai.openai, fetchFn?: typeof globalThis.fetch) {
    super();
    this.model = model;
    this.modelId = model;
    this.client = new OpenAI({
      apiKey,
      ...(fetchFn ? { fetch: fetchFn as unknown as OpenAIClientOptions["fetch"] } : {}),
    });
  }

  /**
   * On the fast path (chained via `previous_response_id`) the prior context
   * lives on OpenAI's side and we have nothing to truncate locally — return
   * the input as-is. On the recovery path (no chain id, full history sent as
   * messages) fall back to the default token-aware truncation.
   */
  protected override truncateInput(input: LLMInput): LLMInput {
    if (input.previousResponseId) return input;
    return super.truncateInput(input);
  }

  private buildParams(input: LLMInput): Record<string, unknown> {
    // o-series (o1, o3, o4-mini…) and all gpt-5 variants are reasoning models
    // and do not support the temperature parameter.
    const isReasoning = /^o\d|^gpt-5/.test(this.model);
    return {
      ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
      ...(input.systemPrompt ? { instructions: input.systemPrompt } : {}),
      // Reasoning models don't support temperature
      ...(!isReasoning && input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
      ...(input.maxTokens !== undefined ? { max_output_tokens: input.maxTokens } : {}),
      ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
      ...(input.verbosity ? { text: { verbosity: input.verbosity } } : {}),
    };
  }

  async chat(input: LLMInput): Promise<LLMOutput> {
    input = this.truncateInput(input);
    logCall(this.model, "chat", {
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      reasoning_effort: input.reasoningEffort,
    });
    const response = await (
      this.client.responses.create as (p: unknown) => Promise<OpenAI.Responses.Response>
    )({
      model: this.model,
      input: this.buildInput(input),
      ...this.buildParams(input),
    });
    const usage = response.usage;
    return {
      text: response.output_text,
      tokensUsed: usage ? usage.input_tokens + usage.output_tokens : 0,
      newResponseId: response.id,
    };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string, StreamResult, unknown> {
    input = this.truncateInput(input);
    logCall(this.model, "chatStream", {
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      reasoning_effort: input.reasoningEffort,
    });
    const stream = await (
      this.client.responses.create as (
        p: unknown,
      ) => Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent>>
    )({
      model: this.model,
      input: this.buildInput(input),
      ...this.buildParams(input),
      stream: true,
    });

    let newResponseId: string | undefined;
    let inputTokensUsed = 0;
    let outputTokensUsed = 0;

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield event.delta;
      } else if (event.type === "response.completed") {
        newResponseId = event.response.id;
        const usage = event.response.usage;
        if (usage) {
          inputTokensUsed = usage.input_tokens;
          outputTokensUsed = usage.output_tokens;
        }
      }
    }

    return { newResponseId, inputTokensUsed, outputTokensUsed };
  }

  private buildInput(input: LLMInput): string | OpenAI.Responses.ResponseInput {
    const urls = input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [];
    const docs = (input.documentAttachments ?? []).filter((d) => !!d.url);
    const hasHistory = !input.previousResponseId && (input.history?.length ?? 0) > 0;

    const buildUserContent = (): OpenAI.Responses.ResponseInputContent[] => [
      ...(input.prompt ? [{ type: "input_text" as const, text: input.prompt }] : []),
      ...urls.map((url) => ({
        type: "input_image" as const,
        image_url: url,
        detail: "auto" as const,
      })),
      ...docs.map(
        (d) =>
          ({
            type: "input_file" as const,
            file_url: d.url!,
          }) as unknown as OpenAI.Responses.ResponseInputContent,
      ),
    ];

    if (hasHistory) {
      const items: OpenAI.Responses.ResponseInput = [];
      for (const m of input.history!) {
        const histDocs = (m.attachments ?? []).filter((a) => !!a.url);
        if (m.role === "user") {
          const content: OpenAI.Responses.ResponseInputContent[] = [
            ...(m.content ? [{ type: "input_text" as const, text: m.content }] : []),
            ...histDocs.map(
              (d) =>
                ({
                  type: "input_file" as const,
                  file_url: d.url!,
                }) as unknown as OpenAI.Responses.ResponseInputContent,
            ),
          ];
          items.push({ role: "user", content });
        } else {
          items.push({
            role: "assistant",
            content: [{ type: "output_text" as const, text: m.content }],
          } as unknown as OpenAI.Responses.ResponseInput[number]);
        }
      }
      items.push({ role: "user", content: buildUserContent() });
      return items;
    }

    if (urls.length > 0 || docs.length > 0) {
      return [{ role: "user", content: buildUserContent() }];
    }
    return input.prompt;
  }
}
