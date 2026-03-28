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

  async chat(input: LLMInput): Promise<LLMOutput> {
    logCall(this.model, "chat", { temperature: input.temperature, max_tokens: input.maxTokens });
    const response = await this.client.responses.create({
      model: this.model,
      input: this.buildInput(input),
      ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { max_output_tokens: input.maxTokens } : {}),
    });
    const usage = response.usage;
    return {
      text: response.output_text,
      tokensUsed: usage ? usage.input_tokens + usage.output_tokens : 0,
      newResponseId: response.id,
    };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string, StreamResult, unknown> {
    logCall(this.model, "chatStream", { temperature: input.temperature, max_tokens: input.maxTokens });
    const stream = await this.client.responses.create({
      model: this.model,
      input: this.buildInput(input),
      ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { max_output_tokens: input.maxTokens } : {}),
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

    if (urls.length > 0) {
      const content: OpenAI.Responses.ResponseInputContent[] = [
        ...(input.prompt ? [{ type: "input_text" as const, text: input.prompt }] : []),
        ...urls.map((url) => ({
          type: "input_image" as const,
          image_url: url,
          detail: "auto" as const,
        })),
      ];
      return [{ role: "user", content }];
    }
    return input.prompt;
  }
}
