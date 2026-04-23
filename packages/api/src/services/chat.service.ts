import { createLLMAdapter } from "../ai/llm/factory.js";
import { dialogService, type StoredAttachment } from "./dialog.service.js";
import { calculateCost, checkBalance, deductTokens } from "./token.service.js";
import type { LLMInput, MessageAttachment } from "../ai/llm/base.adapter.js";
import { AI_MODELS, UserFacingError } from "@metabox/shared";
import { userStateService } from "./user-state.service.js";
import { getFileUrl } from "./s3.service.js";
import {
  extractPdfTextFromS3,
  extractTextFromS3Cached,
  buildDocumentPromptBlock,
  isTextClassMime,
} from "./document-extract.service.js";
import type { MessageRecord } from "../ai/llm/base.adapter.js";
import { ContextOverflowError, isContextOverflowError } from "../ai/llm/truncate.js";
import { logger } from "../logger.js";
import { acquireKey, markRateLimited, recordSuccess, recordError } from "./key-pool.service.js";
import { isPoolExhaustedError } from "../utils/pool-exhausted-error.js";
import { resolveKeyProvider } from "../ai/key-provider.js";
import { classifyRateLimit } from "../utils/rate-limit-error.js";

export { ContextOverflowError } from "../ai/llm/truncate.js";

/**
 * Per-request memoiser for `extractTextFromS3Cached` calls. Eliminates the
 * N+1 pattern when the same s3Key appears in multiple history messages
 * (e.g. a CSV re-attached every turn). Lives only for the duration of one
 * `sendMessageStream` invocation.
 */
type ExtractCache = Map<string, Promise<string | null>>;

function getOrExtract(
  cache: ExtractCache,
  s3Key: string,
  mimeType: string,
  name: string,
): Promise<string | null> {
  let p = cache.get(s3Key);
  if (!p) {
    p = extractTextFromS3Cached(s3Key, mimeType, name);
    cache.set(s3Key, p);
  }
  return p;
}

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

    const model = AI_MODELS[dialog.modelId];
    const keyProvider = resolveKeyProvider(dialog.modelId);

    // Acquire a key from the pool before any work — if the pool is exhausted
    // (all keys throttled), surface a user-facing "model temporarily unavailable"
    // error rather than enqueueing (chat is interactive, no re-enqueue path).
    let acquired;
    try {
      acquired = await acquireKey(keyProvider);
    } catch (err) {
      if (isPoolExhaustedError(err)) {
        throw new UserFacingError(`Pool exhausted for ${keyProvider}`, {
          key: "modelTemporarilyUnavailable",
          params: { modelName: model?.name ?? dialog.modelId },
        });
      }
      throw err;
    }
    const acquiredKeyId = acquired.keyId;
    const adapter = createLLMAdapter(dialog.modelId, acquired);

    // Split attachments into two classes:
    //  - text-class (.txt, .csv, .docx, .xlsx, etc.) — always extracted + inlined.
    //  - native-class (.pdf) — native content blocks for supporting models,
    //    extract+inline fallback otherwise.
    const allDocs = documentAttachments ?? [];
    const textClassDocs = allDocs.filter((d) => isTextClassMime(d.mimeType));
    const nativeClassDocs = allDocs.filter((d) => d.mimeType === "application/pdf");
    const hasDocs = allDocs.length > 0;

    // Gate: native-class PDFs on a model with neither flag — reject before any DB writes.
    // Text-class documents are always accepted (they work on any model via inline extract).
    if (
      nativeClassDocs.length > 0 &&
      model &&
      !model.supportsDocuments &&
      !model.documentTextExtractFallback
    ) {
      throw new DocumentNotSupportedError();
    }

    const ms = await userStateService.getEffectiveDialogSettings(userId, dialogId, dialog.modelId);

    const extractCache: ExtractCache = new Map();

    // Check balance > 0 cause we dont know how much outputTokens will be generated
    await checkBalance(userId, 0);

    // Build effectivePrompt by inlining any text-class docs, plus native PDFs
    // for text-extract fallback models. Original `content` stays untouched in DB.
    const inlineBlocks: string[] = [];
    for (const doc of textClassDocs) {
      const text = await getOrExtract(extractCache, doc.s3Key, doc.mimeType, doc.name);
      if (text === null) throw new DocumentExtractFailedError(doc.name);
      inlineBlocks.push(buildDocumentPromptBlock(doc.name, text));
    }
    if (nativeClassDocs.length > 0 && model?.documentTextExtractFallback) {
      for (const doc of nativeClassDocs) {
        const text = await extractPdfTextFromS3(doc.s3Key);
        if (text === null) throw new DocumentExtractFailedError(doc.name);
        inlineBlocks.push(buildDocumentPromptBlock(doc.name, text));
      }
    }
    const effectivePrompt = inlineBlocks.length
      ? `${inlineBlocks.join("\n\n")}\n\n${content}`
      : content;

    // For native-document models, presign URLs for PDF attachments right before the call.
    // Text-class docs are never passed to the adapter — they live in effectivePrompt.
    let currentDocAttachments: MessageAttachment[] | undefined;
    if (nativeClassDocs.length > 0 && model?.supportsDocuments) {
      currentDocAttachments = await Promise.all(
        nativeClassDocs.map(async (d) => ({
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
      ...(ms.context_window != null ? { contextWindowOverride: ms.context_window as number } : {}),
    };

    if (dialog.contextStrategy === "db_history") {
      const history = await dialogService.getHistory(dialogId, adapter.contextMaxMessages);
      // For every historical message: re-inline text-class attachments by reading
      // them from S3 on each turn (mirrors how claude.ai re-sends extracted text).
      // Additionally, for native-doc models, presign URLs for PDF attachments so
      // the adapter can rebuild document content blocks for prior turns.
      input.history = await Promise.all(
        history.map((m) =>
          augmentHistoryMessage(m, model?.supportsDocuments === true, extractCache),
        ),
      );
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

    // Stream response — iterate manually to capture the generator return value.
    // For provider_chain (OpenAI Responses): if the chained call overflows the
    // context window, fall back to sending the full conversation history as
    // messages (truncated by the adapter) — user never sees an overflow error.
    // The retry happens BEFORE any chunks are yielded to the user.
    const chunks: string[] = [];
    let inputTokensUsed: number | undefined;
    let cachedInputTokensUsed: number | undefined;
    let outputTokensUsed: number | undefined;
    let providerUsdCost: number | undefined;

    const runStream = async function* (
      this: void,
      runInput: LLMInput,
    ): AsyncGenerator<string, void, unknown> {
      const gen = adapter.chatStream(runInput);
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
          cachedInputTokensUsed = result?.cachedInputTokensUsed;
          outputTokensUsed = result?.outputTokensUsed;
          providerUsdCost = result?.providerUsdCost;
          return;
        }
        chunks.push(next.value);
        yield next.value;
      }
    };

    try {
      try {
        yield* runStream(input);
      } catch (err) {
        const canRetry =
          dialog.contextStrategy === "provider_chain" &&
          input.previousResponseId !== undefined &&
          chunks.length === 0 &&
          isContextOverflowError(err) &&
          !(err instanceof ContextOverflowError);
        if (!canRetry) throw err;

        logger.warn(
          { dialogId, modelId: dialog.modelId },
          "chat.sendMessageStream: provider context overflow — retrying with full history",
        );
        const history = await dialogService.getHistory(dialogId, 1000);
        const augmented = await Promise.all(
          history.map((m) =>
            augmentHistoryMessage(m, model?.supportsDocuments === true, extractCache),
          ),
        );
        const retryInput: LLMInput = {
          ...input,
          history: augmented,
          previousResponseId: undefined,
        };
        yield* runStream(retryInput);
      }
    } catch (err) {
      // Per-key metrics + throttle on 429-class errors. We only attribute when
      // the pool actually gave us a DB-tracked key (env-fallback yields keyId=null).
      if (acquiredKeyId) {
        const cls = classifyRateLimit(err, keyProvider);
        if (cls.isRateLimit) {
          void markRateLimited(acquiredKeyId, cls.cooldownMs, cls.reason);
        } else {
          void recordError(acquiredKeyId, err instanceof Error ? err.message : String(err));
        }
      }
      await dialogService.markMessageFailed(userMessage.id);
      // Convert raw 429 into a user-facing message; pool selection already gave us
      // the best available key, so a 429 here means the picked key is now also
      // throttled — the user can retry shortly and a different key may be free.
      const cls = classifyRateLimit(err, keyProvider);
      if (cls.isRateLimit) {
        throw new UserFacingError(`Rate-limited on ${keyProvider}`, {
          key: "modelTemporarilyUnavailable",
          params: { modelName: model?.name ?? dialog.modelId },
        });
      }
      throw err;
    }

    if (acquiredKeyId) void recordSuccess(acquiredKeyId);

    const responseText = stripThinkingBlocks(chunks.join(""));
    const tokensUsed =
      providerUsdCost !== undefined
        ? providerUsdCost
        : model && inputTokensUsed !== undefined && outputTokensUsed !== undefined
          ? calculateCost(
              model,
              inputTokensUsed,
              outputTokensUsed,
              undefined,
              undefined,
              ms,
              undefined,
              undefined,
              {
                cachedInputTokens: cachedInputTokensUsed,
              },
            )
          : estimateTokens(content, responseText);

    // Save assistant message
    await dialogService.saveMessage(dialogId, "assistant", responseText, { tokensUsed });

    // Deduct tokens
    await deductTokens(userId, tokensUsed, dialog.modelId, dialogId);

    return { text: responseText, tokensUsed };
  },
};

/**
 * Rebuilds a historical message for adapter consumption:
 *  - Text-class attachments are extracted from S3 on every turn and inlined
 *    into the message content as `<document>` blocks (silent skip on failure,
 *    so a single corrupted file doesn't block the whole dialog).
 *  - PDF attachments are kept on `attachments[]` with a freshly presigned URL
 *    (only useful for adapters that build native document blocks).
 */
interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: StoredAttachment[];
}

async function augmentHistoryMessage(
  m: HistoryMessage,
  presignNativePdfs: boolean,
  extractCache: ExtractCache,
): Promise<MessageRecord> {
  const atts = m.attachments ?? [];
  if (atts.length === 0) return { id: m.id, role: m.role, content: m.content };

  const textDocs = atts.filter((a) => isTextClassMime(a.mimeType));
  const nativeDocs = atts.filter((a) => a.mimeType === "application/pdf");

  const blocks: string[] = [];
  for (const d of textDocs) {
    const text = await getOrExtract(extractCache, d.s3Key, d.mimeType, d.name);
    if (text !== null) blocks.push(buildDocumentPromptBlock(d.name, text));
  }
  const augmentedContent = blocks.length ? `${blocks.join("\n\n")}\n\n${m.content}` : m.content;

  let presignedNative: MessageAttachment[] | undefined;
  if (presignNativePdfs && nativeDocs.length > 0) {
    presignedNative = await Promise.all(
      nativeDocs.map(async (d) => ({
        ...d,
        url: (await getFileUrl(d.s3Key)) ?? undefined,
      })),
    );
  }

  return {
    id: m.id,
    role: m.role,
    content: augmentedContent,
    ...(presignedNative?.length ? { attachments: presignedNative } : {}),
  };
}

/** Strip <think>...</think> reasoning blocks from model output before saving. */
function stripThinkingBlocks(text: string): string {
  return text.replace(/\s*<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

/** Rough token estimation: ~4 chars per token. */
function estimateTokens(prompt: string, completion: string): number {
  return Math.ceil((prompt.length + completion.length) / 4) / 1000;
}
