import OpenAI from "openai";
import type { LLMAdapter, LLMInput, LLMOutput, StreamResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/**
 * OpenAI Responses API adapter (provider_chain strategy).
 * Uses previous_response_id to chain responses — no history transfer needed.
 */
export class OpenAIAdapter implements LLMAdapter {
  readonly contextStrategy = "provider_chain" as const;
  readonly contextMaxMessages = 0;

  private client: OpenAI;

  constructor(
    private readonly model: string,
    apiKey = config.ai.openai,
  ) {
    this.client = new OpenAI({ apiKey });
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

    if (urls.length > 0 || docs.length > 0) {
      const content: OpenAI.Responses.ResponseInputContent[] = [
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
      return [{ role: "user", content }];
    }
    return input.prompt;
  }
}
