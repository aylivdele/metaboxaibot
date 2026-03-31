import type { Job } from "bullmq";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import { deductTokens, calculateCost, computeVideoTokens } from "@metabox/api/services";
import { buildS3Key, sectionMeta, uploadBuffer, getFileUrl } from "@metabox/api/services/s3";
import { generateDownloadToken } from "@metabox/api/utils/download-token";
import { InputFile } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { parseMp4Duration } from "@metabox/api/utils/mp4-duration";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT } from "@metabox/shared";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 144; // 12 minutes max

const telegram = new Api(config.bot.token);

export async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    imageUrl,
    telegramChatId,
    sendOriginalLabel,
    aspectRatio,
    duration,
    modelSettings,
  } = job.data;

  logger.info({ dbJobId, modelId }, "Processing video job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createVideoAdapter(modelId);

  try {
    // On retry: if generation already completed, skip submit/poll
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: { outputUrl: true, s3Key: true },
    });

    let outputUrl: string;
    let s3Key: string | null;
    let videoBuffer: Buffer | null = null;

    if (existingJob?.outputUrl) {
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      outputUrl = existingJob.outputUrl;
      s3Key = existingJob.s3Key ?? null;
    } else {
      const providerJobId = await adapter.submit({
        prompt,
        imageUrl,
        aspectRatio,
        duration,
        modelSettings,
        userId: BigInt(userIdStr),
      });
      logger.info({ dbJobId, modelId, providerJobId }, "Submitted video generation task");

      let videoResult = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);
        videoResult = await adapter.poll(providerJobId);
        if (videoResult) break;
      }

      if (!videoResult) {
        throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
      }

      const { ext, contentType } = sectionMeta("video");

      // Fetch video to buffer — needed for S3 upload and duration detection.
      // Use adapter.fetchBuffer when available (e.g. Veo URLs require auth).
      let actualDuration: number | null = null;
      try {
        const buf = adapter.fetchBuffer
          ? await adapter.fetchBuffer(videoResult.url)
          : await fetch(videoResult.url).then((r) =>
              r.ok
                ? r.arrayBuffer().then(Buffer.from)
                : Promise.reject(new Error(`HTTP ${r.status}`)),
            );
        videoBuffer = buf;
        actualDuration = parseMp4Duration(buf);
      } catch {
        // non-fatal: fall back to estimated duration
      }

      s3Key = videoBuffer
        ? await uploadBuffer(
            buildS3Key("video", userIdStr, dbJobId, ext),
            videoBuffer,
            contentType,
          ).catch(() => null)
        : null;

      outputUrl = videoResult.url;

      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "done", outputUrl, s3Key, completedAt: new Date() },
      });

      const model = AI_MODELS[modelId];
      if (model) {
        const effectiveDuration = actualDuration ?? duration ?? 5;
        const videoTokens = model.costUsdPerMVideoToken
          ? computeVideoTokens(model, aspectRatio, effectiveDuration)
          : undefined;
        await deductTokens(
          BigInt(userIdStr),
          calculateCost(model, 0, 0, undefined, videoTokens, modelSettings, effectiveDuration),
          modelId,
        );
      }
    }

    const origRow: InlineKeyboardButton[] | null = sendOriginalLabel
      ? [{ text: sendOriginalLabel, callback_data: `orig_${dbJobId}` }]
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
    const rows = [downloadRow, origRow].filter(Boolean) as InlineKeyboardButton[][];
    const replyMarkup = rows.length ? { inline_keyboard: rows } : undefined;

    // Prefer already-downloaded buffer, then S3 URL, then download fresh from provider URL
    const tgVideoSource = await resolveTelegramVideoSource(s3Key, outputUrl, videoBuffer);

    // Determine actual byte size: buffer is exact; for S3 URL do a HEAD request.
    let videoByteSize = videoBuffer?.byteLength;
    if (!videoByteSize && typeof tgVideoSource === "string") {
      const head = await fetch(tgVideoSource, { method: "HEAD" }).catch(() => null);
      if (head?.ok) {
        videoByteSize = parseInt(head.headers.get("content-length") ?? "NaN", 10);
      }
    }

    // Telegram limits: 20 MB via URL, 50 MB via buffer upload
    const isUrl = typeof tgVideoSource === "string";
    const VIDEO_MAX_BYTES = isUrl ? 20 * 1024 * 1024 : 50 * 1024 * 1024;
    const tooLargeForTelegram = (videoByteSize || Number.MAX_SAFE_INTEGER) > VIDEO_MAX_BYTES;
    let slicedPrompt = prompt.slice(0, 200);
    slicedPrompt = slicedPrompt.concat(slicedPrompt.length < 200 ? "" : "...");
    const model = AI_MODELS[modelId];

    if (tooLargeForTelegram && downloadRow) {
      // File exceeds Telegram's video limit — send a download link instead
      await telegram.sendMessage(
        telegramChatId,
        `✅ ${model.name ?? modelId}: ${slicedPrompt}\n\n${t.errors.fileTooLargeForTelegram}`,
        { reply_markup: { inline_keyboard: [downloadRow] } },
      );
    } else {
      await telegram.sendVideo(telegramChatId, tgVideoSource, {
        caption: `✅ ${model.name ?? modelId}: ${slicedPrompt}`,
        reply_markup: replyMarkup,
      });
    }

    logger.info({ dbJobId }, "Video job completed");
  } catch (err) {
    logger.error({ dbJobId, err }, "Video job failed");

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

async function resolveTelegramVideoSource(
  s3Key: string | null,
  providerUrl: string,
  cachedBuffer: Buffer | null,
): Promise<string | InstanceType<typeof InputFile>> {
  // Prefer S3 URL (public or presigned) — Telegram can fetch both without buffering
  if (s3Key) {
    const s3Url = await getFileUrl(s3Key).catch(() => null);
    if (s3Url) return s3Url;
  }
  if (cachedBuffer) return new InputFile(cachedBuffer, "video.mp4");
  const res = await fetch(providerUrl);
  if (!res.ok) throw new Error(`Failed to fetch video from provider: ${res.status}`);
  return new InputFile(Buffer.from(await res.arrayBuffer()), "video.mp4");
}
