import type { Job } from "bullmq";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import { deductTokens, calculateCost, computeVideoTokens } from "@metabox/api/services";
import { buildS3Key, sectionMeta, uploadFromUrl } from "@metabox/api/services/s3";
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
    const providerJobId = await adapter.submit({
      prompt,
      imageUrl,
      aspectRatio,
      duration,
      modelSettings,
    });

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
    const s3Key = await uploadFromUrl(
      buildS3Key("video", userIdStr, dbJobId, ext),
      videoResult.url,
      contentType,
    ).catch(() => null);

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "done", outputUrl: videoResult.url, s3Key, completedAt: new Date() },
    });

    const model = AI_MODELS[modelId];
    if (model) {
      const effectiveDuration = duration ?? 5;
      const videoTokens = model.costUsdPerMVideoToken
        ? computeVideoTokens(model, aspectRatio, effectiveDuration)
        : undefined;
      await deductTokens(
        BigInt(userIdStr),
        calculateCost(model, 0, 0, undefined, videoTokens, modelSettings, effectiveDuration),
        modelId,
      );
    }

    const replyMarkup = sendOriginalLabel
      ? { inline_keyboard: [[{ text: sendOriginalLabel, callback_data: `orig_${dbJobId}` }]] }
      : undefined;

    await telegram.sendVideo(telegramChatId, videoResult.url, {
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
