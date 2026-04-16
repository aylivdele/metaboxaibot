import { UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { resolveUserFacingMessage } from "../utils/user-facing-error.js";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import type { ImageJobData } from "@metabox/api/queues";
import { getImageQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createImageAdapter } from "@metabox/api/ai/image";
import type { ImageResult } from "@metabox/api/ai/image";
import { deductTokens, calculateCost, translatePromptIfNeeded } from "@metabox/api/services";
import {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  getFileUrl,
  generateThumbnail,
  measureImageMegapixels,
} from "@metabox/api/services/s3";
import { generateDownloadToken } from "@metabox/api/utils/download-token";
import { InputFile } from "grammy";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT } from "@metabox/shared";
import { notifyTechError } from "../utils/notify-error.js";
import {
  submitWithThrottle,
  isRateLimitDeferredError,
  isRateLimitLongWindowError,
} from "../utils/submit-with-throttle.js";

const INITIAL_POLL_INTERVAL_MS = 5000;

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

  const stage = job.data.stage ?? "generate";

  logger.info({ dbJobId, modelId, stage }, "Processing image job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);
  const modelMeta = AI_MODELS[modelId];
  const modelName = modelMeta?.name ?? modelId;

  const adapter = createImageAdapter(modelId);

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: { outputUrl: true, s3Key: true, providerJobId: true },
    });

    let outputUrl: string;
    let s3Key: string | null;
    let imageResults: ImageResult[] = [];

    if (existingJob?.outputUrl) {
      // Stage 3 already done — skip submit + poll (crash-recovery fast path)
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      outputUrl = existingJob.outputUrl;
      s3Key = existingJob.s3Key ?? null;
    } else if (stage === "generate") {
      // ── Stage 1: submit ────────────────────────────────────────────────
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "processing" },
      });

      if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);

      let providerJobId: string;
      if (existingJob?.providerJobId) {
        providerJobId = existingJob.providerJobId;
        logger.info({ dbJobId, providerJobId }, "Resuming poll for existing provider job");
      } else {
        const effectivePrompt = await translatePromptIfNeeded(
          prompt,
          modelSettings,
          BigInt(userIdStr),
          modelId,
        );
        providerJobId = await submitWithThrottle({
          modelId,
          provider: modelMeta?.provider,
          section: "image",
          job,
          queue: getImageQueue(),
          submit: () =>
            adapter.submit!({
              prompt: effectivePrompt,
              negativePrompt,
              imageUrl: job.data.sourceImageUrl,
              mediaInputs: job.data.mediaInputs,
              aspectRatio,
              modelSettings,
            }),
        });
        await db.generationJob.update({
          where: { id: dbJobId },
          data: { providerJobId },
        });
      }

      // Schedule the first poll job and exit. The current job is now done.
      await getImageQueue().add(
        "poll",
        {
          ...job.data,
          stage: "poll",
          pollStartedAt: Date.now(),
          lastIntervalMs: INITIAL_POLL_INTERVAL_MS,
        },
        { delay: INITIAL_POLL_INTERVAL_MS, attempts: 1, removeOnComplete: true },
      );
      logger.info({ dbJobId, providerJobId }, "Image poll scheduled");
      return;
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      const providerJobId = existingJob?.providerJobId;
      if (!providerJobId) throw new Error(`Image poll stage without providerJobId: ${dbJobId}`);
      if (!adapter.poll) throw new Error(`Adapter ${modelId} has no poll()`);

      const pollResult = await adapter.poll(providerJobId);

      if (!pollResult) {
        // Not done yet — schedule the next poll with tiered interval.
        const elapsed = Date.now() - (job.data.pollStartedAt ?? Date.now());
        const interval = getIntervalForElapsed(elapsed);

        if (interval === null) {
          // 24 h hard cap — cancel and notify.
          await db.generationJob.update({
            where: { id: dbJobId },
            data: { status: "failed", error: "poll timeout (24h)" },
          });
          await telegram
            .sendMessage(
              telegramChatId,
              t.errors.generationTimedOut24h.replace("{modelName}", modelName),
            )
            .catch(() => void 0);
          throw new UnrecoverableError("poll timeout 24h");
        }

        if (job.data.lastIntervalMs !== undefined && interval !== job.data.lastIntervalMs) {
          await telegram
            .sendMessage(
              telegramChatId,
              t.errors.generationStillRunning.replace("{modelName}", modelName),
            )
            .catch(() => void 0);
        }

        await getImageQueue().add(
          "poll",
          { ...job.data, stage: "poll", lastIntervalMs: interval },
          { delay: interval, attempts: 1, removeOnComplete: true },
        );
        return;
      }

      // Normalize to array
      imageResults = Array.isArray(pollResult) ? pollResult : [pollResult];

      // Process first image → main generationJob record
      const firstResult = imageResults[0];
      const isSvg = firstResult.filename?.endsWith(".svg") ?? false;
      const resolvedContentType = isSvg
        ? "image/svg+xml"
        : (firstResult.contentType ?? sectionMeta("image").contentType);
      const resolvedExt = isSvg
        ? "svg"
        : (resolvedContentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg");

      let imageBuffer: Buffer | null = null;
      try {
        const res = await fetch(firstResult.url);
        if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        logger.error({ reason: e }, "Could not fetch image buffer");
      }

      const mainKey = buildS3Key("image", userIdStr, dbJobId, resolvedExt);
      s3Key = imageBuffer
        ? await uploadBuffer(mainKey, imageBuffer, resolvedContentType).catch((reason) => {
            logger.error({ reason }, "Could not upload image buffer");
            return null;
          })
        : null;

      let thumbnailS3Key: string | null = null;
      if (imageBuffer && s3Key) {
        const thumbBuf = await generateThumbnail(imageBuffer, resolvedContentType);
        if (thumbBuf) {
          thumbnailS3Key = await uploadBuffer(
            buildThumbnailKey(s3Key),
            thumbBuf,
            "image/webp",
          ).catch(() => null);
        }
      }

      outputUrl = firstResult.url;

      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "done", outputUrl, s3Key, thumbnailS3Key, completedAt: new Date() },
      });

      const model = AI_MODELS[modelId];
      if (model) {
        const megapixels =
          model.costUsdPerMPixel && firstResult.width && firstResult.height
            ? (firstResult.width * firstResult.height) / 1_000_000
            : undefined;

        // img2img input surcharge — collect all input image URLs (media-input
        // slots in `edit` mode) plus the legacy single sourceImageUrl.
        const editUrls: string[] =
          (job.data.mediaInputs as Record<string, string[]> | undefined)?.edit ?? [];
        const legacyUrl = job.data.sourceImageUrl;
        const inputUrls: string[] = editUrls.length > 0 ? editUrls : legacyUrl ? [legacyUrl] : [];
        const hasInputImage = inputUrls.length > 0;
        let inputImagesMegapixels: number[] | undefined;
        if (hasInputImage && model.costUsdPerMPixelInput && !model.costUsdPerMPixelInputFixed) {
          // Per-image ceil is required for accurate billing — measure each.
          inputImagesMegapixels = (
            await Promise.all(inputUrls.map((u) => measureImageMegapixels(u).catch(() => 0)))
          ).filter((mp) => mp > 0);
        } else if (hasInputImage && model.costUsdPerMPixelInputFixed) {
          // Fixed-fee models: size doesn't matter, only the count.
          inputImagesMegapixels = inputUrls.map(() => 1);
        }

        await deductTokens(
          BigInt(userIdStr),
          calculateCost(model, 0, 0, megapixels, undefined, modelSettings, undefined, undefined, {
            hasInputImage,
            inputImagesMegapixels,
          }),
          modelId,
        );
      }
    }

    // ── Stage 3: send to user ────────────────────────────────────────────
    let slicedPrompt = prompt.slice(0, 200);
    slicedPrompt = slicedPrompt.concat(slicedPrompt.length < 200 ? "" : "...");

    // Batch: multiple images → send as media group
    if (imageResults.length > 1) {
      // Upload extra images to S3 (first one is already uploaded above)
      const extraS3Keys: (string | null)[] = [];
      for (let i = 1; i < imageResults.length; i++) {
        const ir = imageResults[i];
        const ext =
          ir.contentType?.split("/")[1]?.replace("jpeg", "jpg") ??
          ir.filename?.split(".").pop() ??
          "png";
        const ct = ir.contentType ?? sectionMeta("image").contentType;
        let buf: Buffer | null = null;
        try {
          const res = await fetch(ir.url);
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        } catch (e) {
          logger.error({ reason: e, index: i }, "Could not fetch batch image buffer");
        }
        const key = buildS3Key("image", userIdStr, `${dbJobId}_${i + 1}`, ext);
        const uploaded = buf
          ? await uploadBuffer(key, buf, ct).catch((reason) => {
              logger.error({ reason, index: i }, "Could not upload batch image buffer");
              return null;
            })
          : null;
        extraS3Keys.push(uploaded);

        // Generate thumbnails for extra images
        if (buf && uploaded) {
          const thumbBuf = await generateThumbnail(buf, ct);
          if (thumbBuf) {
            await uploadBuffer(buildThumbnailKey(uploaded), thumbBuf, "image/webp").catch(
              () => null,
            );
          }
        }
      }

      // Build media group: all images as InputMediaPhoto
      const allS3Keys = [s3Key, ...extraS3Keys];
      const mediaGroup: Array<{
        type: "photo";
        media: string | InstanceType<typeof InputFile>;
        caption?: string;
      }> = [];

      for (let i = 0; i < imageResults.length; i++) {
        const ir = imageResults[i];
        const key = allS3Keys[i];
        const { source } = await resolveTelegramSource(
          key,
          ir.url,
          ir.filename ?? `image-${i + 1}.png`,
        );
        mediaGroup.push({
          type: "photo",
          media: source,
          ...(i === 0 ? { caption: `✅ ${modelId}: ${slicedPrompt}` } : {}),
        });
      }

      await telegram.sendMediaGroup(telegramChatId, mediaGroup);

      // Send refine + download buttons as a separate message (media groups don't support inline keyboards)
      const refineRow = dbJobId
        ? [{ text: t.design.refine, callback_data: `design_ref_${dbJobId}` }]
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
      if (rows.length) {
        await telegram.sendMessage(telegramChatId, "⬆️", {
          reply_markup: { inline_keyboard: rows },
        });
      }

      if (dialogId) {
        await db.message.create({
          data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
        });
        for (const ir of imageResults) {
          await db.message.create({
            data: {
              dialogId,
              role: "assistant",
              content: "",
              mediaUrl: ir.url,
              mediaType: "image",
              tokensUsed: 0,
            },
          });
        }
      }

      logger.info({ dbJobId, batchSize: imageResults.length }, "Image batch job completed");
      return;
    }

    // Single image path (original logic)
    const retryExt = s3Key?.split(".").pop() ?? "png";
    const finalImageResult = {
      url: outputUrl,
      filename: `${dbJobId}.${retryExt}`,
      contentType: `image/${retryExt}`,
    };
    if (dialogId) {
      const existingMsg = await db.message.findFirst({
        where: { dialogId, mediaUrl: outputUrl },
        select: { id: true },
      });
      if (!existingMsg) {
        await db.message.create({
          data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
        });
        await db.message.create({
          data: {
            dialogId,
            role: "assistant",
            content: "",
            mediaUrl: outputUrl,
            mediaType: "image",
            tokensUsed: 0,
          },
        });
      }
    }

    const refineRow = dbJobId
      ? [{ text: t.design.refine, callback_data: `design_ref_${dbJobId}` }]
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

    const { source: tgImageSource, byteSize } = await resolveTelegramSource(
      s3Key,
      finalImageResult.url,
      finalImageResult.filename ?? "image.png",
    );

    const isUrl = typeof tgImageSource === "string";
    const PHOTO_MAX_BYTES = isUrl ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    const DOCUMENT_MAX_BYTES = isUrl ? 20 * 1024 * 1024 : 50 * 1024 * 1024;
    const isSvg = finalImageResult.filename?.endsWith("svg") ?? false;
    const useDocument = isSvg || byteSize > PHOTO_MAX_BYTES;
    const tooLargeForTelegram = byteSize > DOCUMENT_MAX_BYTES;

    if (tooLargeForTelegram) {
      await telegram.sendMessage(
        telegramChatId,
        `✅ ${modelId}: ${slicedPrompt}\n\n${t.errors.fileTooLargeForTelegram}`,
        { reply_markup: replyMarkup },
      );
    } else if (useDocument) {
      await telegram.sendDocument(telegramChatId, tgImageSource, {
        caption: `✅ ${modelId}: ${slicedPrompt}`,
        reply_markup: replyMarkup,
      });
    } else {
      await telegram.sendPhoto(telegramChatId, tgImageSource, {
        caption: `✅ ${modelId}: ${slicedPrompt}`,
        reply_markup: replyMarkup,
      });
    }

    logger.info({ dbJobId }, "Image job completed");
  } catch (err) {
    if (isRateLimitDeferredError(err)) {
      logger.info({ dbJobId, modelId, delayMs: err.delayMs }, "Image job deferred by throttle");
      return;
    }
    if (isRateLimitLongWindowError(err)) {
      const msg = t.errors.modelTemporarilyUnavailable.replace("{modelName}", modelName);
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: msg },
      });
      await telegram.sendMessage(telegramChatId, msg).catch(() => void 0);
      throw new UnrecoverableError(msg);
    }
    const userMsg = resolveUserFacingMessage(err, t);
    if (userMsg !== null) {
      logger.warn({ dbJobId, err }, "Image job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: userMsg },
      });
      await telegram.sendMessage(telegramChatId, userMsg).catch(() => void 0);
      throw new UnrecoverableError(userMsg);
    }

    logger.error({ dbJobId, err }, "Image job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      await notifyTechError(err, {
        jobId: dbJobId,
        modelId,
        section: "image",
        userId: userIdStr,
        attempt: job.attemptsMade,
      });

      await telegram
        .sendMessage(telegramChatId, t.errors.generationFailed.replace("{modelName}", modelName))
        .catch(() => void 0);
    }

    throw err;
  }
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
    }
  }
  const res = await fetch(providerUrl);
  if (!res.ok) throw new Error(`Failed to fetch image from provider: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { source: new InputFile(buffer, filename), byteSize: buffer.byteLength };
}
