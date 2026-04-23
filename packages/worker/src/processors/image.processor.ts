import { UnrecoverableError, DelayedError } from "bullmq";
import type { Job } from "bullmq";
import { delayJob } from "../utils/delay-job.js";
import { resolveUserFacingMessage, shouldNotifyOps } from "../utils/user-facing-error.js";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import type { ImageJobData } from "@metabox/api/queues";
import { getImageQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createImageAdapter } from "@metabox/api/ai/image";
import type { ImageResult } from "@metabox/api/ai/image";
import {
  deductTokens,
  calculateCost,
  usdToTokens,
  translatePromptIfNeeded,
} from "@metabox/api/services";
import {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  getFileUrl,
  generateThumbnail,
  measureImageMegapixels,
  compressForTelegramPhoto,
} from "@metabox/api/services/s3";
import { generateDownloadToken } from "@metabox/api/utils/download-token";
import { InputFile } from "grammy";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT, buildResultCaption } from "@metabox/shared";
import type { DeductResult } from "@metabox/api/services";
import { notifyTechError } from "../utils/notify-error.js";
import {
  submitWithThrottle,
  isRateLimitDeferredError,
  isRateLimitLongWindowError,
} from "../utils/submit-with-throttle.js";
import { acquireForSubmit, acquireForPoll } from "../utils/acquire-for-processor.js";
import { resolveKeyProvider } from "@metabox/api/ai/key-provider";
import { deferIfTransientNetworkError } from "../utils/defer-transient.js";

const INITIAL_POLL_INTERVAL_MS = 5000;

/** Telegram multipart upload limit for sendDocument (used by `orig_` callback). */
const TELEGRAM_DOC_MAX_BYTES = 50 * 1024 * 1024;

const telegram = new Api(config.bot.token);

/** Upload an image to S3 and generate a thumbnail. Returns { s3Key, thumbnailS3Key }. */
async function uploadImageToS3(
  url: string,
  userIdStr: string,
  keySuffix: string,
  contentTypeHint?: string,
  filenameHint?: string,
): Promise<{ s3Key: string | null; thumbnailS3Key: string | null; buffer: Buffer | null }> {
  const isSvg = filenameHint?.endsWith(".svg") ?? false;
  const resolvedContentType = isSvg
    ? "image/svg+xml"
    : (contentTypeHint ?? sectionMeta("image").contentType);
  const resolvedExt = isSvg
    ? "svg"
    : (resolvedContentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg");

  let imageBuffer: Buffer | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    logger.error({ reason: e }, "Could not fetch image buffer");
  }

  const key = buildS3Key("image", userIdStr, keySuffix, resolvedExt);
  const s3Key = imageBuffer
    ? await uploadBuffer(key, imageBuffer, resolvedContentType).catch((reason) => {
        logger.error({ reason }, "Could not upload image buffer");
        return null;
      })
    : null;

  let thumbnailS3Key: string | null = null;
  if (imageBuffer && s3Key) {
    const thumbBuf = await generateThumbnail(imageBuffer, resolvedContentType);
    if (thumbBuf) {
      thumbnailS3Key = await uploadBuffer(buildThumbnailKey(s3Key), thumbBuf, "image/webp").catch(
        () => null,
      );
    }
  }

  return { s3Key, thumbnailS3Key, buffer: imageBuffer };
}

export async function processImageJob(job: Job<ImageJobData>, token?: string): Promise<void> {
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
  const keyProvider = resolveKeyProvider(modelId);

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: {
        providerJobId: true,
        providerKeyId: true,
        status: true,
        outputs: { orderBy: { index: "asc" as const } },
      },
    });

    // Output records created during finalization — used for buttons in Stage 3
    let outputRecords: Array<{ id: string; outputUrl: string | null; s3Key: string | null }> = [];
    let deductResult: DeductResult | undefined;

    // Finalizes a set of generated image results: uploads to S3, creates
    // output records, marks the job done and deducts tokens. Shared between
    // the sync-adapter path (Stage 1) and the async-adapter poll path (Stage 2).
    const finalizeResults = async (imageResults: ImageResult[]): Promise<void> => {
      for (let i = 0; i < imageResults.length; i++) {
        const ir = imageResults[i];
        const keySuffix = imageResults.length > 1 ? `${dbJobId}_${i + 1}` : dbJobId;
        let s3Key: string | null;
        let thumbnailS3Key: string | null;

        if (ir.base64Data) {
          // gpt-image returns raw base64 — decode and upload directly.
          const ext = ir.filename?.split(".").pop() ?? "png";
          const contentType =
            ir.contentType ??
            (ext === "webp" ? "image/webp" : ext === "jpg" ? "image/jpeg" : "image/png");
          const key = buildS3Key("image", userIdStr, keySuffix, ext);
          const buffer = Buffer.from(ir.base64Data, "base64");
          s3Key = await uploadBuffer(key, buffer, contentType).catch(() => null);
          thumbnailS3Key = null;
          if (s3Key) {
            const thumbBuf = await generateThumbnail(buffer, contentType);
            if (thumbBuf) {
              thumbnailS3Key = await uploadBuffer(
                buildThumbnailKey(s3Key),
                thumbBuf,
                "image/webp",
              ).catch(() => null);
            }
          }
        } else {
          const up = await uploadImageToS3(
            ir.url,
            userIdStr,
            keySuffix,
            ir.contentType,
            ir.filename,
          );
          s3Key = up.s3Key;
          thumbnailS3Key = up.thumbnailS3Key;
        }

        const output = await db.generationJobOutput.create({
          data: { jobId: dbJobId, index: i, outputUrl: ir.url, s3Key, thumbnailS3Key },
        });
        outputRecords.push({ id: output.id, outputUrl: ir.url, s3Key });
      }

      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "done", completedAt: new Date() },
      });

      // Billing — use first image for megapixel calculation.
      const firstResult = imageResults[0];
      const model = AI_MODELS[modelId];
      if (!model) return;

      const megapixels =
        model.costUsdPerMPixel && firstResult.width && firstResult.height
          ? (firstResult.width * firstResult.height) / 1_000_000
          : undefined;

      const editUrls: string[] =
        (job.data.mediaInputs as Record<string, string[]> | undefined)?.edit ?? [];
      const legacyUrl = job.data.sourceImageUrl;
      const inputUrls: string[] = editUrls.length > 0 ? editUrls : legacyUrl ? [legacyUrl] : [];
      const hasInputImage = inputUrls.length > 0;
      let inputImagesMegapixels: number[] | undefined;
      if (hasInputImage && model.costUsdPerMPixelInput && !model.costUsdPerMPixelInputFixed) {
        inputImagesMegapixels = (
          await Promise.all(inputUrls.map((u) => measureImageMegapixels(u).catch(() => 0)))
        ).filter((mp) => mp > 0);
      } else if (hasInputImage && model.costUsdPerMPixelInputFixed) {
        inputImagesMegapixels = inputUrls.map(() => 1);
      }

      // Adapter-supplied cost (e.g. gpt-image, which sums text + image input +
      // output tokens from OpenAI usage) wins over the matrix lookup, since
      // the matrix only covers per-image output cost.
      const adapterUsdCost = firstResult.providerUsdCost;
      const internalCost =
        adapterUsdCost !== undefined
          ? usdToTokens(adapterUsdCost)
          : calculateCost(model, 0, 0, megapixels, undefined, modelSettings, undefined, undefined, {
              hasInputImage,
              inputImagesMegapixels,
            });

      deductResult = await deductTokens(BigInt(userIdStr), internalCost, modelId);
    };

    if (existingJob?.outputs?.length) {
      // Stage 3 already done — skip submit + poll (crash-recovery fast path)
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      outputRecords = existingJob.outputs;
    } else if (stage === "generate") {
      // ── Stage 1: submit (or sync-generate) ─────────────────────────────
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "processing" },
      });

      const effectivePrompt = await translatePromptIfNeeded(
        prompt,
        modelSettings,
        BigInt(userIdStr),
        modelId,
      );

      const acquired = await acquireForSubmit({
        provider: keyProvider,
        modelId,
        job,
        queue: getImageQueue(),
      });
      const adapter = createImageAdapter(modelId, acquired);

      if (!adapter.isAsync && adapter.generate) {
        // Sync adapter (DALL-E, gpt-image, recraft) — generate inline, then finalize.
        const genResult = await submitWithThrottle({
          modelId,
          provider: modelMeta?.provider,
          section: "image",
          job,
          queue: getImageQueue(),
          keyId: acquired.keyId,
          submit: () =>
            adapter.generate!({
              prompt: effectivePrompt,
              negativePrompt,
              imageUrl: job.data.sourceImageUrl,
              mediaInputs: job.data.mediaInputs,
              aspectRatio,
              modelSettings,
            }),
        });
        const imageResults: ImageResult[] = Array.isArray(genResult) ? genResult : [genResult];
        await finalizeResults(imageResults);
      } else {
        // Async adapter — submit then schedule poll.
        if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);

        let providerJobId: string;
        if (existingJob?.providerJobId) {
          providerJobId = existingJob.providerJobId;
          logger.info({ dbJobId, providerJobId }, "Resuming poll for existing provider job");
        } else {
          providerJobId = await submitWithThrottle({
            modelId,
            provider: modelMeta?.provider,
            section: "image",
            job,
            queue: getImageQueue(),
            keyId: acquired.keyId,
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
            data: {
              providerJobId,
              providerKeyId: acquired.keyId,
              // Фиксируем момент перехода в poll-стадию: после Redis wipe
              // recovery восстановит таймер с этой точки, а не с нуля.
              pollStartedAt: new Date(),
            },
          });
        }

        logger.info({ dbJobId, providerJobId }, "Image poll scheduled");
        await delayJob(
          job,
          {
            ...job.data,
            stage: "poll",
            pollStartedAt: Date.now(),
            lastIntervalMs: INITIAL_POLL_INTERVAL_MS,
          },
          INITIAL_POLL_INTERVAL_MS,
          token,
        );
      }
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      const providerJobId = existingJob?.providerJobId;
      if (!providerJobId) throw new Error(`Image poll stage without providerJobId: ${dbJobId}`);

      const acquired = await acquireForPoll(existingJob?.providerKeyId, keyProvider);
      const adapter = createImageAdapter(modelId, acquired);
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

        await delayJob(
          job,
          { ...job.data, stage: "poll", lastIntervalMs: interval },
          interval,
          token,
        );
        return; // unreachable — restores TS narrowing for pollResult
      }

      const imageResults: ImageResult[] = Array.isArray(pollResult) ? pollResult : [pollResult];
      await finalizeResults(imageResults);
    }

    // ── Stage 3: send to user ────────────────────────────────────────────
    const modelForCaption = AI_MODELS[modelId];
    const displayName = modelForCaption?.name ?? modelId;
    const buildCaption = (): string =>
      buildResultCaption(t, displayName, prompt, {
        cost: deductResult?.deducted,
        subscriptionBalance: deductResult?.subscriptionTokenBalance,
        tokenBalance: deductResult?.tokenBalance,
      });

    // Batch: multiple outputs → send as media group
    if (outputRecords.length > 1) {
      const mediaGroup: Array<{
        type: "photo";
        media: string | InstanceType<typeof InputFile>;
        caption?: string;
      }> = [];

      const batchCaption = buildCaption();
      const byteSizes: number[] = [];
      for (let i = 0; i < outputRecords.length; i++) {
        const rec = outputRecords[i];
        const filename = `image-${i + 1}.png`;
        const info = await resolveTelegramSource(rec.s3Key, rec.outputUrl ?? "");
        byteSizes.push(info.byteSize);
        const { source } = await prepareTelegramPhoto(info, rec.outputUrl ?? "", filename);
        mediaGroup.push({
          type: "photo",
          media: source,
          ...(i === 0 ? { caption: batchCaption } : {}),
        });
      }

      await telegram.sendMediaGroup(telegramChatId, mediaGroup);

      // Send a single message with refine + (orig|download) buttons for all outputs.
      // Per output: "{N}. 🔄" paired with "{N}. 📎" (≤50 MB) or "{N}. ⬇️" (>50 MB).
      {
        const buttons: InlineKeyboardButton[] = [];
        for (let i = 0; i < outputRecords.length; i++) {
          const rec = outputRecords[i];
          const n = i + 1;
          buttons.push({ text: `${n}. 🔄`, callback_data: `design_ref_${rec.id}` });
          if (byteSizes[i] <= TELEGRAM_DOC_MAX_BYTES) {
            buttons.push({ text: `${n}. 📎`, callback_data: `orig_${rec.id}` });
          } else if (rec.s3Key && config.api.publicUrl) {
            buttons.push({
              text: `${n}. ⬇️`,
              url: `${config.api.publicUrl}/download/${generateDownloadToken(rec.s3Key, userIdStr)}`,
            });
          }
        }
        // Layout: <3 pairs → 1 per row, even → 2 per row, odd → 3 per row
        const rows: InlineKeyboardButton[][] = [];
        const totalPairs = outputRecords.length;
        const pairsPerRow = totalPairs <= 3 ? 1 : totalPairs % 2 === 0 ? 2 : 3;
        const chunkSize = 2 * pairsPerRow;
        for (let i = 0; i < buttons.length; i += chunkSize) {
          rows.push(buttons.slice(i, i + chunkSize));
        }
        await telegram.sendMessage(telegramChatId, t.design.batchActions, {
          reply_markup: { inline_keyboard: rows },
        });
      }

      if (dialogId) {
        await db.message.create({
          data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
        });
        for (const rec of outputRecords) {
          await db.message.create({
            data: {
              dialogId,
              role: "assistant",
              content: "",
              mediaUrl: rec.outputUrl ?? "",
              mediaType: "image",
              tokensUsed: 0,
            },
          });
        }
      }

      logger.info({ dbJobId, batchSize: outputRecords.length }, "Image batch job completed");
      return;
    }

    // Single output path
    const rec = outputRecords[0];
    const outputUrl = rec?.outputUrl ?? "";
    const s3Key = rec?.s3Key ?? null;
    const outputId = rec?.id ?? dbJobId;

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

    const filename = finalImageResult.filename ?? "image.png";
    const info = await resolveTelegramSource(s3Key, finalImageResult.url);
    const { source: tgImageSource, isSvg } = await prepareTelegramPhoto(
      info,
      finalImageResult.url,
      filename,
    );

    const refineRow: InlineKeyboardButton[] = [
      { text: t.design.refine, callback_data: `design_ref_${outputId}` },
    ];
    const actionRow: InlineKeyboardButton[] | null =
      info.byteSize <= TELEGRAM_DOC_MAX_BYTES
        ? [{ text: t.common.sendOriginal, callback_data: `orig_${outputId}` }]
        : s3Key && config.api.publicUrl
          ? [
              {
                text: t.common.downloadFile,
                url: `${config.api.publicUrl}/download/${generateDownloadToken(s3Key, userIdStr)}`,
              },
            ]
          : null;
    const rows = [refineRow, actionRow].filter(Boolean) as InlineKeyboardButton[][];
    const replyMarkup = rows.length ? { inline_keyboard: rows } : undefined;

    const singleCaption = buildCaption();
    if (isSvg) {
      await telegram.sendDocument(telegramChatId, tgImageSource, {
        caption: singleCaption,
        reply_markup: replyMarkup,
      });
    } else {
      await telegram.sendPhoto(telegramChatId, tgImageSource, {
        caption: singleCaption,
        reply_markup: replyMarkup,
      });
    }

    logger.info({ dbJobId }, "Image job completed");
  } catch (err) {
    if (err instanceof DelayedError) throw err;
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
    if (
      await deferIfTransientNetworkError({
        err,
        job,
        queue: getImageQueue(),
        section: "image",
      })
    ) {
      return;
    }
    const userMsg = resolveUserFacingMessage(err, t);
    if (userMsg !== null) {
      logger.warn({ dbJobId, err }, "Image job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: userMsg },
      });
      if (shouldNotifyOps(err)) {
        await notifyTechError(err, {
          jobId: dbJobId,
          modelId,
          section: "image",
          userId: userIdStr,
          attempt: job.attemptsMade,
        });
      }
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

type TelegramImageInfo =
  | { kind: "url"; url: string; byteSize: number }
  | { kind: "buffer"; buffer: Buffer; byteSize: number };

/**
 * Returns the best source info for sending an image to Telegram:
 * 1. S3 presigned URL if HEAD confirms reachability + size (Telegram can fetch directly).
 * 2. S3 presigned URL downloaded as a buffer (when HEAD fails / lacks content-length,
 *    e.g. some S3-compat stores omit it on presigned responses).
 * 3. Provider URL as a last resort — only when S3 isn't configured or we never
 *    stored the file. Provider URLs from fal / Google (nano banana 2) are often
 *    single-use or short-lived and will 409/410 on re-fetch by this point.
 */
async function resolveTelegramSource(
  s3Key: string | null,
  providerUrl: string,
): Promise<TelegramImageInfo> {
  if (s3Key) {
    const s3Url = await getFileUrl(s3Key).catch(() => null);
    if (s3Url) {
      const head = await fetch(s3Url, { method: "HEAD" }).catch(() => null);
      if (head?.ok) {
        const contentLength = head.headers.get("content-length");
        const byteSize = contentLength ? parseInt(contentLength, 10) : NaN;
        if (!isNaN(byteSize) && byteSize > 0) {
          return { kind: "url", url: s3Url, byteSize };
        }
      }
      // HEAD not usable — GET the S3 copy directly instead of re-fetching
      // the (possibly single-use / expired) provider URL.
      const s3Res = await fetch(s3Url).catch(() => null);
      if (s3Res?.ok) {
        const buffer = Buffer.from(await s3Res.arrayBuffer());
        if (buffer.byteLength > 0) {
          return { kind: "buffer", buffer, byteSize: buffer.byteLength };
        }
      }
    }
  }
  const res = await fetch(providerUrl);
  if (!res.ok) throw new Error(`Failed to fetch image from provider: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { kind: "buffer", buffer, byteSize: buffer.byteLength };
}

/** Telegram photo limits: 5MB for URL-based sendPhoto, 10MB for multipart upload. */
const PHOTO_URL_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_BUFFER_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Prepares a Telegram photo source. If the image exceeds photo size limits
 * (and isn't SVG), it's re-encoded in-memory to a JPEG that fits, so we can
 * still deliver it as a photo instead of a document. The re-encoded bytes
 * are not persisted — original S3 copy stays intact.
 */
async function prepareTelegramPhoto(
  info: TelegramImageInfo,
  providerUrl: string,
  filename: string,
): Promise<{ source: string | InstanceType<typeof InputFile>; isSvg: boolean }> {
  const isSvg = filename.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const src = info.kind === "url" ? info.url : new InputFile(info.buffer, filename);
    return { source: src, isSvg: true };
  }

  if (info.kind === "url" && info.byteSize <= PHOTO_URL_MAX_BYTES) {
    return { source: info.url, isSvg: false };
  }
  if (info.kind === "buffer" && info.byteSize <= PHOTO_BUFFER_MAX_BYTES) {
    return { source: new InputFile(info.buffer, filename), isSvg: false };
  }

  // Too large for sendPhoto — download (if URL) and compress in memory.
  let buffer: Buffer;
  if (info.kind === "buffer") {
    buffer = info.buffer;
  } else {
    const res = await fetch(info.url).catch(() => null);
    if (!res || !res.ok) {
      // Fallback to provider URL if S3 fetch fails.
      const fallback = await fetch(providerUrl);
      if (!fallback.ok) throw new Error(`Failed to fetch image: ${fallback.status}`);
      buffer = Buffer.from(await fallback.arrayBuffer());
    } else {
      buffer = Buffer.from(await res.arrayBuffer());
    }
  }
  const compressed = await compressForTelegramPhoto(buffer);
  const jpegName = filename.replace(/\.[^.]+$/, "") + ".jpg";
  return { source: new InputFile(compressed, jpegName), isSvg: false };
}
