import type { Job } from "bullmq";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import { deductTokens, calculateCost, computeVideoTokens } from "@metabox/api/services";
import { buildS3Key, sectionMeta, uploadBuffer, getFileUrl } from "@metabox/api/services/s3";
import { InputFile } from "grammy";
import { parseMp4Duration } from "@metabox/api/utils/mp4-duration";
import { logger } from "../logger.js";
import { config, AI_MODELS } from "@metabox/shared";

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

      // Fetch video to buffer — needed for S3 upload and duration detection
      let actualDuration: number | null = null;
      try {
        const videoResp = await fetch(videoResult.url);
        if (videoResp.ok) {
          videoBuffer = Buffer.from(await videoResp.arrayBuffer());
          actualDuration = parseMp4Duration(videoBuffer);
        }
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

    const replyMarkup = sendOriginalLabel
      ? { inline_keyboard: [[{ text: sendOriginalLabel, callback_data: `orig_${dbJobId}` }]] }
      : undefined;

    // Prefer already-downloaded buffer, then S3 URL, then download fresh from provider URL
    const tgVideoSource = await resolveTelegramVideoSource(s3Key, outputUrl, videoBuffer);

    await telegram.sendVideo(telegramChatId, tgVideoSource, {
      caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
      reply_markup: replyMarkup,
    });

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
  // Only use S3 URL when it's a public URL — presigned URLs are not reachable by Telegram's servers
  if (s3Key && config.s3.publicUrl) {
    const s3Url = await getFileUrl(s3Key).catch(() => null);
    if (s3Url) return s3Url;
  }
  if (cachedBuffer) return new InputFile(cachedBuffer, "video.mp4");
  const res = await fetch(providerUrl);
  if (!res.ok) throw new Error(`Failed to fetch video from provider: ${res.status}`);
  return new InputFile(Buffer.from(await res.arrayBuffer()), "video.mp4");
}
