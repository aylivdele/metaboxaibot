import { UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import type { ImageJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createImageAdapter } from "@metabox/api/ai/image";
import { deductTokens, calculateCost } from "@metabox/api/services";
import { buildS3Key, sectionMeta, uploadFromUrl, getFileUrl } from "@metabox/api/services/s3";
import { generateDownloadToken } from "@metabox/api/utils/download-token";
import { InputFile } from "grammy";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT } from "@metabox/shared";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 120; // 6 minutes max

const telegram = new Api(config.bot.token);

export async function processImageJob(job: Job<ImageJobData>): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    negativePrompt,
    telegramChatId,
    dialogId,
    aspectRatio,
    modelSettings,
  } = job.data;

  logger.info({ dbJobId, modelId }, "Processing image job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createImageAdapter(modelId);

  try {
    // On retry: check if generation already completed and skip re-submitting to provider
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: { outputUrl: true, s3Key: true },
    });

    let outputUrl: string;
    let s3Key: string | null;

    if (existingJob?.outputUrl) {
      // Generation succeeded on a previous attempt — skip submit/poll
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      outputUrl = existingJob.outputUrl;
      s3Key = existingJob.s3Key ?? null;
    } else {
      if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);
      const providerJobId = await adapter.submit({
        prompt,
        negativePrompt,
        imageUrl: job.data.sourceImageUrl,
        aspectRatio,
        modelSettings,
      });

      let imageResult = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);
        imageResult = await adapter.poll!(providerJobId);
        if (imageResult) break;
      }

      if (!imageResult) {
        throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
      }

      const isSvg = imageResult.filename?.endsWith(".svg") ?? false;
      const resolvedContentType = isSvg
        ? "image/svg+xml"
        : (imageResult.contentType ?? sectionMeta("image").contentType);
      const resolvedExt = isSvg
        ? "svg"
        : (resolvedContentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg");
      s3Key = await uploadFromUrl(
        buildS3Key("image", userIdStr, dbJobId, resolvedExt),
        imageResult.url,
        resolvedContentType,
      ).catch(() => null);

      outputUrl = imageResult.url;

      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "done", outputUrl, s3Key, completedAt: new Date() },
      });

      const model = AI_MODELS[modelId];
      if (model) {
        const megapixels =
          model.costUsdPerMPixel && imageResult.width && imageResult.height
            ? (imageResult.width * imageResult.height) / 1_000_000
            : undefined;
        await deductTokens(
          BigInt(userIdStr),
          calculateCost(model, 0, 0, megapixels, undefined, modelSettings),
          modelId,
        );
      }
    }

    const retryExt = s3Key?.split(".").pop() ?? "png";
    const imageResult = {
      url: outputUrl,
      filename: `${dbJobId}.${retryExt}`,
      contentType: `image/${retryExt}`,
    };
    const model = AI_MODELS[modelId];

    // Save messages to dialog and get assistantMessageId for Refine button
    // (only on first attempt — skip if messages already exist for this job)
    let assistantMessageId: string | undefined;
    if (dialogId) {
      const existingMsg = await db.message.findFirst({
        where: { dialogId, mediaUrl: outputUrl },
        select: { id: true },
      });
      if (existingMsg) {
        assistantMessageId = existingMsg.id;
      } else {
        await db.message.create({
          data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
        });
        const assistantMsg = await db.message.create({
          data: {
            dialogId,
            role: "assistant",
            content: "",
            mediaUrl: outputUrl,
            mediaType: "image",
            tokensUsed: 0,
          },
        });
        assistantMessageId = assistantMsg.id;
      }
    }

    // Build inline keyboard: optional Refine row + optional Download row
    const refineRow =
      model?.supportsImages && assistantMessageId
        ? [{ text: "🔄 Доработать", callback_data: `design_ref_${assistantMessageId}` }]
        : null;
    const downloadRow: InlineKeyboardButton[] | null =
      s3Key && config.api.publicUrl
        ? [
            {
              text: t.common.downloadFile,
              url: `${config.api.publicUrl}/download/${generateDownloadToken(s3Key, userIdStr)}`,
            },
          ]
        : null;
    const rows = [refineRow, downloadRow].filter(Boolean) as InlineKeyboardButton[][];
    const replyMarkup = rows.length ? { inline_keyboard: rows } : undefined;

    // Prefer S3 URL (always accessible by Telegram); fall back to downloading
    // the provider URL as a buffer (some providers like fal.media block Telegram's fetcher).
    const { source: tgImageSource, byteSize } = await resolveTelegramSource(
      s3Key,
      imageResult.url,
      imageResult.filename ?? "image.png",
    );

    // Telegram limits differ for URL vs uploaded buffer.
    // When source is a URL (byteSize known via HEAD), use URL limits: 5 MB photo, 20 MB document.
    // When source is a buffer (InputFile), limits are 10 MB photo, 50 MB document.
    const isUrl = typeof tgImageSource === "string";
    const PHOTO_MAX_BYTES = isUrl ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    const DOCUMENT_MAX_BYTES = isUrl ? 20 * 1024 * 1024 : 50 * 1024 * 1024;
    const isSvg = imageResult.filename?.endsWith("svg") ?? false;
    const useDocument = isSvg || byteSize > PHOTO_MAX_BYTES;
    const tooLargeForTelegram = byteSize > DOCUMENT_MAX_BYTES;

    if (tooLargeForTelegram) {
      // File exceeds Telegram's document limit — send a download link instead
      await telegram.sendMessage(
        telegramChatId,
        `✅ ${modelId}: ${prompt.slice(0, 200)}\n\n${t.errors.fileTooLargeForTelegram}`,
        { reply_markup: replyMarkup },
      );
    } else if (useDocument) {
      await telegram.sendDocument(telegramChatId, tgImageSource, {
        caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
        reply_markup: replyMarkup,
      });
    } else {
      await telegram.sendPhoto(telegramChatId, tgImageSource, {
        caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
        reply_markup: replyMarkup,
      });
    }

    logger.info({ dbJobId }, "Image job completed");
  } catch (err) {
    // Content policy violation — notify user immediately and skip retries
    const isContentPolicy =
      err !== null &&
      typeof err === "object" &&
      "body" in err &&
      Array.isArray((err as { body?: { detail?: unknown[] } }).body?.detail) &&
      (err as { body: { detail: Array<{ type?: string }> } }).body.detail.some(
        (d) => d?.type === "content_policy_violation",
      );

    if (isContentPolicy) {
      logger.warn({ dbJobId }, "Image job rejected: content policy violation");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: "content_policy_violation" },
      });
      await telegram
        .sendMessage(telegramChatId, t.errors.contentPolicyViolation)
        .catch(() => void 0);
      throw new UnrecoverableError("content_policy_violation");
    }

    logger.error({ dbJobId, err }, "Image job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      await telegram
        .sendMessage(
          telegramChatId,
          "❌ Ошибка при генерации, попробуйте позже или обратитесь в поддержку.",
        )
        .catch(() => void 0);
    }

    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Returns the best source to send to Telegram:
 * 1. S3 public/presigned URL if available (always reachable by Telegram).
 * 2. Downloaded buffer wrapped in InputFile (for providers like fal.media that
 *    block Telegram's HTTP fetcher).
 */
async function resolveTelegramSource(
  s3Key: string | null,
  providerUrl: string,
  filename: string,
): Promise<{ source: string | InstanceType<typeof InputFile>; byteSize: number }> {
  // Prefer S3 URL (public) — Telegram can fetch without buffering.
  // HEAD request to get actual byte size so size-based routing (photo vs document) works correctly.
  if (s3Key) {
    const s3Url = await getFileUrl(s3Key).catch(() => null);
    if (s3Url) {
      const head = await fetch(s3Url, { method: "HEAD" }).catch(() => null);
      if (head?.ok) {
        const contentLength = head.headers.get("content-length");
        const byteSize = contentLength ? parseInt(contentLength, 10) : NaN;
        if (!isNaN(byteSize) && byteSize > 0) {
          return { source: s3Url, byteSize };
        }
      }
      // HEAD missing or no Content-Length — fall through to download for exact size
    }
  }
  // Download the image ourselves and send as a buffer
  const res = await fetch(providerUrl);
  if (!res.ok) throw new Error(`Failed to fetch image from provider: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { source: new InputFile(buffer, filename), byteSize: buffer.byteLength };
}
