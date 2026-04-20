import { UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { resolveUserFacingMessage } from "../utils/user-facing-error.js";
import { isHeyGenProviderUnavailable } from "@metabox/api/utils/heygen-error";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { getVideoQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import {
  deductTokens,
  calculateCost,
  computeVideoTokens,
  translatePromptIfNeeded,
} from "@metabox/api/services";
import type { DeductResult } from "@metabox/api/services";
import {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  getFileUrl,
  generateVideoThumbnail,
} from "@metabox/api/services/s3";
import { generateDownloadToken } from "@metabox/api/utils/download-token";
import { InputFile } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { parseMp4Info } from "@metabox/api/utils/mp4-duration";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT, buildResultCaption } from "@metabox/shared";
import { notifyTechError } from "../utils/notify-error.js";
import {
  submitWithThrottle,
  isRateLimitDeferredError,
  isRateLimitLongWindowError,
} from "../utils/submit-with-throttle.js";

const INITIAL_POLL_INTERVAL_MS = 5000;

const telegram = new Api(config.bot.token);

export async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    imageUrl,
    mediaInputs,
    telegramChatId,
    sendOriginalLabel,
    aspectRatio,
    duration,
    modelSettings,
  } = job.data;

  const stage = job.data.stage ?? "generate";

  logger.info({ dbJobId, modelId, stage }, "Processing video job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);
  const modelMeta = AI_MODELS[modelId];
  const modelName = modelMeta?.name ?? modelId;

  const adapter = createVideoAdapter(modelId);

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: {
        providerJobId: true,
        status: true,
        outputs: { orderBy: { index: "asc" as const }, take: 1 },
      },
    });

    let outputUrl: string;
    let s3Key: string | null;
    let outputId: string;
    let videoBuffer: Buffer | null = null;
    let videoResult: Awaited<ReturnType<typeof adapter.poll>> | null = null;
    let deductResult: DeductResult | undefined;

    if (existingJob?.outputs?.length) {
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      outputUrl = existingJob.outputs[0].outputUrl ?? "";
      s3Key = existingJob.outputs[0].s3Key ?? null;
      outputId = existingJob.outputs[0].id;
    } else if (stage === "generate") {
      // ── Stage 1: submit ────────────────────────────────────────────────
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "processing" },
      });

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
          section: "video",
          job,
          queue: getVideoQueue(),
          submit: () =>
            adapter.submit({
              prompt: effectivePrompt,
              imageUrl,
              mediaInputs,
              aspectRatio,
              duration,
              modelSettings,
              userId: BigInt(userIdStr),
            }),
        });
        logger.info({ dbJobId, modelId, providerJobId }, "Submitted video generation task");
        await db.generationJob.update({
          where: { id: dbJobId },
          data: { providerJobId },
        });
      }

      await getVideoQueue().add(
        "poll",
        {
          ...job.data,
          stage: "poll",
          pollStartedAt: Date.now(),
          lastIntervalMs: INITIAL_POLL_INTERVAL_MS,
        },
        { delay: INITIAL_POLL_INTERVAL_MS, attempts: 1, removeOnComplete: true },
      );
      logger.info({ dbJobId, providerJobId }, "Video poll scheduled");
      return;
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      const providerJobId = existingJob?.providerJobId;
      if (!providerJobId) throw new Error(`Video poll stage without providerJobId: ${dbJobId}`);

      videoResult = await adapter.poll(providerJobId);

      if (!videoResult) {
        const elapsed = Date.now() - (job.data.pollStartedAt ?? Date.now());
        const interval = getIntervalForElapsed(elapsed);

        if (interval === null) {
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

        await getVideoQueue().add(
          "poll",
          { ...job.data, stage: "poll", lastIntervalMs: interval },
          { delay: interval, attempts: 1, removeOnComplete: true },
        );
        return;
      }

      // videoResult present → finalize inline.
      const { ext, contentType } = sectionMeta("video");

      let actualDuration: number | null = null;
      let actualWidth: number | null = null;
      let actualHeight: number | null = null;
      let actualFps: number | null = null;
      try {
        const buf = adapter.fetchBuffer
          ? await adapter.fetchBuffer(videoResult.url)
          : await fetch(videoResult.url).then((r) =>
              r.ok
                ? r.arrayBuffer().then(Buffer.from)
                : Promise.reject(new Error(`HTTP ${r.status}`)),
            );
        videoBuffer = buf;
        const info = parseMp4Info(buf);
        actualDuration = info.duration;
        actualWidth = info.width;
        actualHeight = info.height;
        actualFps = info.fps;
      } catch {
        // non-fatal
      }

      s3Key = videoBuffer
        ? await uploadBuffer(
            buildS3Key("video", userIdStr, dbJobId, ext),
            videoBuffer,
            contentType,
          ).catch(() => null)
        : null;

      let thumbnailS3Key: string | null = null;
      if (videoBuffer && s3Key) {
        const thumbBuf = await generateVideoThumbnail(videoBuffer);
        if (thumbBuf) {
          thumbnailS3Key = await uploadBuffer(
            buildThumbnailKey(s3Key),
            thumbBuf,
            "image/webp",
          ).catch(() => null);
        }
      }

      outputUrl = videoResult.url;

      const output = await db.generationJobOutput.create({
        data: { jobId: dbJobId, index: 0, outputUrl, s3Key, thumbnailS3Key },
      });
      outputId = output.id;
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "done", completedAt: new Date() },
      });

      const model = AI_MODELS[modelId];
      if (model) {
        // Providers that bill per whole second — round up so we never under-charge.
        const CEIL_DURATION_MODELS = new Set(["heygen"]);
        const rawDuration = actualDuration ?? duration ?? 5;
        let effectiveDuration = CEIL_DURATION_MODELS.has(modelId)
          ? Math.ceil(rawDuration)
          : rawDuration;

        // Wan 2.7 reference-to-video (first_clip): billable = min(inputDur, 5) + outputDur.
        if (modelId === "wan") {
          const firstClipUrl = (mediaInputs as Record<string, string[]> | undefined)
            ?.first_clip?.[0];
          if (firstClipUrl) {
            const inputSeconds = await fetchClipDurationSec(firstClipUrl).catch(() => 5);
            effectiveDuration += Math.min(inputSeconds, 5);
          }
        }
        const videoTokens = model.costUsdPerMVideoToken
          ? computeVideoTokens(
              model,
              aspectRatio,
              effectiveDuration,
              actualWidth ?? undefined,
              actualHeight ?? undefined,
              actualFps ?? undefined,
            )
          : undefined;
        const refVideos = (mediaInputs as Record<string, string[]> | undefined)?.ref_videos ?? [];
        const hasVideoInputs = refVideos.length > 0;
        deductResult = await deductTokens(
          BigInt(userIdStr),
          calculateCost(
            model,
            0,
            0,
            undefined,
            videoTokens,
            modelSettings,
            effectiveDuration,
            undefined,
            { hasVideoInputs },
          ),
          modelId,
        );
      }
    }

    // ── Stage 3: send to user ────────────────────────────────────────────
    const origRow: InlineKeyboardButton[] | null = sendOriginalLabel
      ? [{ text: sendOriginalLabel, callback_data: `orig_${outputId}` }]
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

    const videoBuf = await resolveTelegramVideoBuffer(s3Key, outputUrl, videoBuffer);

    const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
    const tooLargeForTelegram = videoBuf.byteLength > VIDEO_MAX_BYTES;
    const model = AI_MODELS[modelId];
    const caption = buildResultCaption(t, model?.name ?? modelId, prompt, {
      cost: deductResult?.deducted,
      subscriptionBalance: deductResult?.subscriptionTokenBalance,
      tokenBalance: deductResult?.tokenBalance,
    });

    if (tooLargeForTelegram && downloadRow) {
      await telegram.sendMessage(
        telegramChatId,
        `${caption}\n\n${t.errors.fileTooLargeForTelegram}`,
        { reply_markup: { inline_keyboard: [downloadRow] } },
      );
    } else {
      await telegram.sendVideo(telegramChatId, new InputFile(videoBuf, "video.mp4"), {
        caption,
        reply_markup: replyMarkup,
      });
    }

    logger.info({ dbJobId }, "Video job completed");
  } catch (err) {
    if (isRateLimitDeferredError(err)) {
      logger.info({ dbJobId, modelId, delayMs: err.delayMs }, "Video job deferred by throttle");
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
    if (isHeyGenProviderUnavailable(err)) {
      const msg = t.errors.modelTemporarilyUnavailable.replace("{modelName}", modelName);
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });
      await notifyTechError(err, {
        jobId: dbJobId,
        modelId,
        section: "video",
        userId: userIdStr,
        attempt: job.attemptsMade,
      });
      await telegram.sendMessage(telegramChatId, msg).catch(() => void 0);
      throw new UnrecoverableError(msg);
    }
    const userMsg = resolveUserFacingMessage(err, t);
    if (userMsg !== null) {
      logger.warn({ dbJobId, err }, "Video job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: userMsg },
      });
      await telegram.sendMessage(telegramChatId, userMsg).catch(() => void 0);
      throw new UnrecoverableError(userMsg);
    }

    logger.error({ dbJobId, err }, "Video job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      await notifyTechError(err, {
        jobId: dbJobId,
        modelId,
        section: "video",
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

/** Downloads a clip and returns its duration in seconds (0 on failure). */
async function fetchClipDurationSec(url: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch clip: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const info = parseMp4Info(buf);
  return info.duration ?? 0;
}

async function resolveTelegramVideoBuffer(
  s3Key: string | null,
  providerUrl: string,
  cachedBuffer: Buffer | null,
): Promise<Buffer> {
  // Always resolve to a buffer — passing URLs directly to Telegram
  // fails intermittently when Telegram servers can't reach the provider.
  if (cachedBuffer) return cachedBuffer;
  const url = s3Key ? ((await getFileUrl(s3Key).catch(() => null)) ?? providerUrl) : providerUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch video for Telegram: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
