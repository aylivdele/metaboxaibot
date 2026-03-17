import type { Job } from "bullmq";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import { deductTokens, calculateCost } from "@metabox/api/services";
import { buildS3Key, sectionMeta, uploadFromUrl } from "@metabox/api/services/s3";
import { logger } from "../logger.js";
import { config, AI_MODELS } from "@metabox/shared";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 144; // 12 minutes max

const telegram = new Api(config.bot.token);

export async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { dbJobId, userId: userIdStr, modelId, prompt, imageUrl, telegramChatId } = job.data;

  logger.info({ dbJobId, modelId }, "Processing video job");

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createVideoAdapter(modelId);

  try {
    const providerJobId = await adapter.submit({ prompt, imageUrl });

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
      await deductTokens(BigInt(userIdStr), calculateCost(model), modelId);
    }

    await telegram.sendVideo(telegramChatId, videoResult.url, {
      caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
    });

    logger.info({ dbJobId }, "Video job completed");
  } catch (err) {
    logger.error({ dbJobId, err }, "Video job failed");

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "failed", error: String(err) },
    });

    await telegram
      .sendMessage(telegramChatId, `❌ Video generation failed: ${String(err).slice(0, 200)}`)
      .catch(() => void 0);

    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
