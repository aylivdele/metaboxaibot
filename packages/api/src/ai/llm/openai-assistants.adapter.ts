import OpenAI from "openai";
import type { LLMAdapter, LLMInput, LLMOutput, StreamResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const POLL_INTERVAL_MS = 1000;

/**
 * OpenAI Assistants API adapter (provider_thread strategy).
 * Creates a Thread on first call; subsequent calls reuse the thread.
 * Full history is stored server-side by OpenAI.
 */
export class OpenAIAssistantsAdapter implements LLMAdapter {
  readonly contextStrategy = "provider_thread" as const;
  readonly contextMaxMessages = 0;

  private client: OpenAI;
  private assistantId: string;

  constructor(
    private readonly model: string,
    apiKey = config.ai.openai,
    assistantId = config.ai.openaiAssistantId ?? "",
  ) {
    this.client = new OpenAI({ apiKey });
    this.assistantId = assistantId;
  }

  async chat(input: LLMInput): Promise<LLMOutput> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(input)) {
      chunks.push(chunk);
    }
    return { text: chunks.join(""), tokensUsed: 0 };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string, StreamResult, unknown> {
    // Create thread on first message, reuse on subsequent
    let threadId = input.threadId;
    const isNewThread = !threadId;
    if (!threadId) {
      const thread = await this.client.beta.threads.create();
      threadId = thread.id;
    }

    // Add user message to thread
    await this.client.beta.threads.messages.create(threadId, {
      role: "user",
      content: input.imageUrl
        ? [
            { type: "text", text: input.prompt },
            { type: "image_url", image_url: { url: input.imageUrl } },
          ]
        : input.prompt,
    });

    // Stream the run
    const stream = this.client.beta.threads.runs.stream(threadId, {
      assistant_id: this.assistantId,
      model: this.model,
    });

    for await (const event of stream) {
      if (
        event.event === "thread.message.delta" &&
        event.data.delta.content?.[0]?.type === "text"
      ) {
        const text = event.data.delta.content[0].text?.value ?? "";
        if (text) yield text;
      }
    }

    return { newThreadId: isNewThread ? threadId : undefined };
  }

  /** Poll-based fallback (used if streaming isn't needed). */
  private async pollRun(threadId: string, runId: string): Promise<string> {
    while (true) {
      const run = await this.client.beta.threads.runs.retrieve(threadId, runId);
      if (run.status === "completed") break;
      if (run.status === "failed" || run.status === "cancelled") {
        throw new Error(`Run ${run.status}: ${run.last_error?.message}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    const messages = await this.client.beta.threads.messages.list(threadId, { limit: 1 });
    const msg = messages.data[0];
    if (msg.role === "assistant" && msg.content[0].type === "text") {
      return msg.content[0].text.value;
    }
    return "";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
