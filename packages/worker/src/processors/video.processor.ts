import type { Job } from "bullmq";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import { uploadFromUrl } from "@metabox/api/storage";
import { logger } from "../logger.js";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 144; // 12 minutes max

const telegram = new Api(process.env.BOT_TOKEN!);

export async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { dbJobId, userId: userIdStr, modelId, prompt, imageUrl, telegramChatId } = job.data;

  logger.info({ dbJobId, modelId }, "Processing video job");

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createVideoAdapter(modelId);

  try {
    // Submit to provider
    const providerJobId = await adapter.submit({ prompt, imageUrl });

    // Poll until done
    let videoResult = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);
      videoResult = await adapter.poll(providerJobId);
      if (videoResult) break;
    }

    if (!videoResult) {
      throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
    }

    // Upload to S3
    const s3Url = await uploadFromUrl(videoResult.url, "video");

    // Update DB
    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "done", outputUrl: s3Url, completedAt: new Date() },
    });

    // Notify user via Telegram
    await telegram.sendVideo(telegramChatId, s3Url, {
      caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
    });

    logger.info({ dbJobId, s3Url }, "Video job completed");
  } catch (err) {
    logger.error({ dbJobId, err }, "Video job failed");

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "failed", error: String(err) },
    });

    await telegram
      .sendMessage(telegramChatId, `❌ Video generation failed: ${String(err).slice(0, 200)}`)
      .catch(() => void 0);

    throw err; // let BullMQ handle retries
  }

  void userIdStr;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
