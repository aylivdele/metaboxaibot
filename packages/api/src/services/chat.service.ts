import { createLLMAdapter } from "../ai/llm/factory.js";
import { dialogService } from "./dialog.service.js";
import { calculateCost, checkBalance, deductTokens } from "./token.service.js";
import type { LLMInput } from "../ai/llm/base.adapter.js";
import { AI_MODELS } from "@metabox/shared";
import { userStateService } from "./user-state.service.js";

export interface SendMessageParams {
  dialogId: string;
  userId: bigint;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  /** S3 keys for user-uploaded images (parallel array to imageUrls). Stored in the message record. */
  imageS3Keys?: string[];
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
    const { dialogId, userId, content, imageUrl, imageUrls, imageS3Keys } = params;

    const dialog = await dialogService.findById(dialogId);
    if (!dialog) throw new Error(`Dialog ${dialogId} not found`);

    const adapter = createLLMAdapter(dialog.modelId);

    const allModelSettings = await userStateService.getModelSettings(userId);
    const ms = allModelSettings[dialog.modelId] ?? {};

    // Check balance > 0 cause we dont know how much outputTokens will be generated
    await checkBalance(userId, 0);

    // Build input based on context strategy
    const input: LLMInput = {
      prompt: content,
      imageUrl,
      ...(imageUrls?.length ? { imageUrls } : {}),
      ...(ms.temperature !== undefined ? { temperature: ms.temperature as number } : {}),
      ...(ms.max_tokens !== undefined ? { maxTokens: ms.max_tokens as number } : {}),
      ...(ms.system_prompt ? { systemPrompt: ms.system_prompt as string } : {}),
      ...(ms.search_recency_filter
        ? { searchRecencyFilter: ms.search_recency_filter as string }
        : {}),
      ...(ms.search_context_size ? { searchContextSize: ms.search_context_size as string } : {}),
      ...(ms.search_domain_filter ? { searchDomainFilter: ms.search_domain_filter as string } : {}),
      ...(ms.reasoning_effort ? { reasoningEffort: ms.reasoning_effort as string } : {}),
      ...(ms.verbosity ? { verbosity: ms.verbosity as string } : {}),
      ...(ms.extended_thinking !== undefined
        ? { extendedThinking: ms.extended_thinking as boolean }
        : {}),
      ...(ms.enable_thinking !== undefined
        ? { enableThinking: ms.enable_thinking as boolean }
        : {}),
      ...(ms.thinking_budget !== undefined ? { thinkingBudget: ms.thinking_budget as number } : {}),
      ...(ms.seed != null ? { seed: ms.seed as number } : {}),
    };

    if (dialog.contextStrategy === "db_history") {
      input.history = await dialogService.getHistory(dialogId, adapter.contextMaxMessages);
    } else if (dialog.contextStrategy === "provider_chain") {
      input.previousResponseId = dialog.providerLastResponseId ?? undefined;
    }

    // Save user message — keep the ID so we can mark it failed on error
    // Prefer the first S3 key for storage (presigned at read time); fall back to direct URL
    const firstS3Key = imageS3Keys?.[0];
    const firstImageUrl = imageUrl ?? imageUrls?.[0];
    const savedMediaUrl = firstS3Key ?? firstImageUrl;
    const userMessage = await dialogService.saveMessage(dialogId, "user", content, {
      ...(savedMediaUrl ? { mediaUrl: savedMediaUrl, mediaType: "image" } : {}),
    });

    // Stream response — iterate manually to capture the generator return value
    const chunks: string[] = [];
    const gen = adapter.chatStream(input);

    let inputTokensUsed: number | undefined;
    let outputTokensUsed: number | undefined;
    let providerUsdCost: number | undefined;

    try {
      while (true) {
        const next = await gen.next();
        if (next.done) {
          const result = next.value;
          if (result?.newResponseId) {
            await dialogService.updateProviderContext(dialogId, {
              providerLastResponseId: result.newResponseId,
            });
          }
          inputTokensUsed = result?.inputTokensUsed;
          outputTokensUsed = result?.outputTokensUsed;
          providerUsdCost = result?.providerUsdCost;
          break;
        }
        chunks.push(next.value);
        yield next.value;
      }
    } catch (err) {
      await dialogService.markMessageFailed(userMessage.id);
      throw err;
    }

    const responseText = stripThinkingBlocks(chunks.join(""));
    const model = AI_MODELS[dialog.modelId];
    const tokensUsed =
      providerUsdCost !== undefined
        ? providerUsdCost
        : model && inputTokensUsed !== undefined && outputTokensUsed !== undefined
          ? calculateCost(model, inputTokensUsed, outputTokensUsed, undefined, undefined, ms)
          : estimateTokens(content, responseText);

    // Save assistant message
    await dialogService.saveMessage(dialogId, "assistant", responseText, { tokensUsed });

    // Deduct tokens
    await deductTokens(userId, tokensUsed, dialog.modelId, dialogId);

    return { text: responseText, tokensUsed };
  },
};

/** Strip <think>...</think> reasoning blocks from model output before saving. */
function stripThinkingBlocks(text: string): string {
  return text.replace(/\s*<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

/** Rough token estimation: ~4 chars per token. */
function estimateTokens(prompt: string, completion: string): number {
  return Math.ceil((prompt.length + completion.length) / 4) / 1000;
}
