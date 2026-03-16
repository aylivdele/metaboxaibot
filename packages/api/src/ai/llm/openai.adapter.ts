import OpenAI from "openai";
import type { LLMAdapter, LLMInput, LLMOutput, StreamResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

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
    const response = await this.client.responses.create({
      model: this.model,
      input: this.buildInput(input),
      ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
    });
    const usage = response.usage;
    return {
      text: response.output_text,
      tokensUsed: usage ? usage.input_tokens + usage.output_tokens : 0,
      newResponseId: response.id,
    };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string, StreamResult, unknown> {
    const stream = await this.client.responses.create({
      model: this.model,
      input: this.buildInput(input),
      ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
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
    if (input.imageUrl) {
      const msg: OpenAI.Responses.EasyInputMessage = {
        role: "user",
        content: [
          { type: "input_text", text: input.prompt },
          { type: "input_image", image_url: input.imageUrl, detail: "auto" },
        ],
      };
      return [msg];
    }
    return input.prompt;
  }
}
