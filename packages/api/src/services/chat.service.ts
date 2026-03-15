import { db } from "../db.js";
import { createLLMAdapter } from "../ai/llm/factory.js";
import { dialogService } from "./dialog.service.js";
import type { LLMInput } from "../ai/llm/base.adapter.js";

export interface SendMessageParams {
  dialogId: string;
  userId: bigint;
  content: string;
  imageUrl?: string;
}

export interface SendMessageResult {
  text: string;
  tokensUsed: number;
}

export const chatService = {
  /**
   * Streams the assistant response chunk-by-chunk.
   * Saves both messages to DB and deducts tokens from the user balance.
   * The caller accumulates chunks for display; the final result is returned
   * as the generator's return value via the done object.
   */
  async *sendMessageStream(
    params: SendMessageParams,
  ): AsyncGenerator<string, SendMessageResult, unknown> {
    const { dialogId, userId, content, imageUrl } = params;

    const dialog = await dialogService.findById(dialogId);
    if (!dialog) throw new Error(`Dialog ${dialogId} not found`);

    // Check balance
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (Number(user.tokenBalance) <= 0) {
      throw new Error("INSUFFICIENT_TOKENS");
    }

    const adapter = createLLMAdapter(dialog.modelId);

    // Build input based on context strategy
    const input: LLMInput = { prompt: content, imageUrl };

    if (dialog.contextStrategy === "db_history") {
      input.history = await dialogService.getHistory(dialogId, adapter.contextMaxMessages);
    } else if (dialog.contextStrategy === "provider_chain") {
      input.previousResponseId = dialog.providerLastResponseId ?? undefined;
    } else if (dialog.contextStrategy === "provider_thread") {
      input.threadId = dialog.providerThreadId ?? undefined;
    }

    // Save user message
    await dialogService.saveMessage(dialogId, "user", content);

    // Stream response — iterate manually to capture the generator return value
    const chunks: string[] = [];
    const gen = adapter.chatStream(input);

    while (true) {
      const next = await gen.next();
      if (next.done) {
        const result = next.value;
        if (result?.newResponseId) {
          await dialogService.updateProviderContext(dialogId, {
            providerLastResponseId: result.newResponseId,
          });
        } else if (result?.newThreadId) {
          await dialogService.updateProviderContext(dialogId, {
            providerThreadId: result.newThreadId,
          });
        }
        break;
      }
      chunks.push(next.value);
      yield next.value;
    }

    const responseText = chunks.join("");
    const tokensUsed = estimateTokens(content, responseText);

    // Save assistant message
    await dialogService.saveMessage(dialogId, "assistant", responseText, { tokensUsed });

    // Deduct tokens
    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { tokenBalance: { decrement: tokensUsed } },
      }),
      db.tokenTransaction.create({
        data: {
          userId,
          amount: -tokensUsed,
          type: "debit",
          reason: "ai_usage",
          modelId: dialog.modelId,
          dialogId,
        },
      }),
    ]);

    return { text: responseText, tokensUsed };
  },
};

/** Rough token estimation: ~4 chars per token. */
function estimateTokens(prompt: string, completion: string): number {
  return Math.ceil((prompt.length + completion.length) / 4) / 1000;
}
