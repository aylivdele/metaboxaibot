import { createLLMAdapter } from "../ai/llm/factory.js";
import { dialogService, type StoredAttachment } from "./dialog.service.js";
import { calculateCost, checkBalance, deductTokens } from "./token.service.js";
import type { LLMInput, MessageAttachment } from "../ai/llm/base.adapter.js";
import { AI_MODELS } from "@metabox/shared";
import { userStateService } from "./user-state.service.js";
import { getFileUrl } from "./s3.service.js";
import { extractPdfTextFromS3, buildDocumentPromptBlock } from "./document-extract.service.js";
import { logger } from "../logger.js";

export class DocumentNotSupportedError extends Error {
  constructor() {
    super("Model does not support document inputs");
    this.name = "DocumentNotSupportedError";
  }
}

export class DocumentExtractFailedError extends Error {
  constructor(public readonly fileName: string) {
    super(`Failed to extract text from document: ${fileName}`);
    this.name = "DocumentExtractFailedError";
  }
}

export interface SendMessageParams {
  dialogId: string;
  userId: bigint;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  /** S3 keys for user-uploaded images (parallel array to imageUrls). Stored in the message record. */
  imageS3Keys?: string[];
  /** Document attachments (PDFs etc.) for the current user turn. */
  documentAttachments?: StoredAttachment[];
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
    const { dialogId, userId, content, imageUrl, imageUrls, imageS3Keys, documentAttachments } =
      params;

    const dialog = await dialogService.findById(dialogId);
    if (!dialog) throw new Error(`Dialog ${dialogId} not found`);

    const adapter = createLLMAdapter(dialog.modelId);
    const model = AI_MODELS[dialog.modelId];

    // Gate: if the user attached documents but the model supports neither native
    // documents nor text-extract fallback, reject before any DB writes.
    const hasDocs = !!documentAttachments?.length;
    if (hasDocs && model && !model.supportsDocuments && !model.documentTextExtractFallback) {
      throw new DocumentNotSupportedError();
    }

    const allModelSettings = await userStateService.getModelSettings(userId);
    const ms = allModelSettings[dialog.modelId] ?? {};

    // Check balance > 0 cause we dont know how much outputTokens will be generated
    await checkBalance(userId, 0);

    // If model uses text-extract fallback, pull PDFs from S3, extract text,
    // and inline it into the prompt. Documents are NOT passed to the adapter.
    let effectivePrompt = content;
    if (hasDocs && model?.documentTextExtractFallback) {
      const blocks: string[] = [];
      for (const doc of documentAttachments!) {
        const text = await extractPdfTextFromS3(doc.s3Key);
        if (text === null) throw new DocumentExtractFailedError(doc.name);
        blocks.push(buildDocumentPromptBlock(doc.name, text));
      }
      effectivePrompt = `${blocks.join("\n\n")}\n\n${content}`;
    }

    // For native-document models, presign URLs for each attachment right before the call.
    let currentDocAttachments: MessageAttachment[] | undefined;
    if (hasDocs && model?.supportsDocuments) {
      currentDocAttachments = await Promise.all(
        documentAttachments!.map(async (d) => ({
          ...d,
          url: (await getFileUrl(d.s3Key)) ?? undefined,
        })),
      );
    }

    // Build input based on context strategy
    const input: LLMInput = {
      prompt: effectivePrompt,
      imageUrl,
      ...(imageUrls?.length ? { imageUrls } : {}),
      ...(currentDocAttachments?.length ? { documentAttachments: currentDocAttachments } : {}),
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
      const history = await dialogService.getHistory(dialogId, adapter.contextMaxMessages);
      // For native-document models, presign URLs for every historical attachment
      // so the adapter can build document blocks for prior turns. Text-extract
      // fallback models already have docs inlined as text in the stored content.
      if (model?.supportsDocuments) {
        input.history = await Promise.all(
          history.map(async (m) => {
            if (!m.attachments?.length) return m;
            const withUrls: MessageAttachment[] = await Promise.all(
              m.attachments.map(async (a) => ({
                ...a,
                url: (await getFileUrl(a.s3Key)) ?? undefined,
              })),
            );
            return { ...m, attachments: withUrls };
          }),
        );
      } else {
        input.history = history;
      }
    } else if (dialog.contextStrategy === "provider_chain") {
      input.previousResponseId = dialog.providerLastResponseId ?? undefined;
    }

    // Save user message — keep the ID so we can mark it failed on error.
    // Store BOTH mediaUrl (legacy image) and attachments (documents) as
    // available. We persist the ORIGINAL user content (not effectivePrompt)
    // so UI still shows what the user typed; the extracted-text prefix exists
    // only in-flight for text-fallback models.
    const firstS3Key = imageS3Keys?.[0];
    const firstImageUrl = imageUrl ?? imageUrls?.[0];
    const savedMediaUrl = firstS3Key ?? firstImageUrl;
    const userMessage = await dialogService.saveMessage(dialogId, "user", content, {
      ...(savedMediaUrl ? { mediaUrl: savedMediaUrl, mediaType: "image" } : {}),
      ...(hasDocs ? { attachments: documentAttachments } : {}),
    });
    logger.debug(
      { dialogId, docs: documentAttachments?.length ?? 0, modelId: dialog.modelId },
      "chat.sendMessageStream: user message saved",
    );

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
