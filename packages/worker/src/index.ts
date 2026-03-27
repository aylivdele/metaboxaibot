import "dotenv/config";
import { config } from "@metabox/shared";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { ImageJobData, VideoJobData, AudioJobData, AvatarJobData } from "@metabox/api/queues";
import { processImageJob } from "./processors/image.processor.js";
import { processVideoJob } from "./processors/video.processor.js";
import { processAudioJob } from "./processors/audio.processor.js";
import { processAvatarJob } from "./processors/avatar.processor.js";
import { checkProviderBalances } from "./monitors/balance.monitor.js";
import { logger } from "./logger.js";

const connection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});

const imageWorker = new Worker<ImageJobData>("image", processImageJob, {
  connection,
  concurrency: 3,
});

imageWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Image job completed");
});

imageWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Image job failed");
});

const videoWorker = new Worker<VideoJobData>("video", processVideoJob, {
  connection,
  concurrency: 2,
});

videoWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Video job completed");
});

videoWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Video job failed");
});

const audioWorker = new Worker<AudioJobData>("audio", processAudioJob, {
  connection,
  concurrency: 5,
});

audioWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Audio job completed");
});

audioWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Audio job failed");
});

const avatarWorker = new Worker<AvatarJobData>("avatar", processAvatarJob, {
  connection,
  concurrency: 3,
});

avatarWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Avatar job completed");
});

avatarWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Avatar job failed");
});

logger.info("Worker started — listening on image, video, audio and avatar queues");

// ── Balance monitor ───────────────────────────────────────────────────────────
if (config.alerts.chatId) {
  const intervalMs = config.alerts.intervalHours * 60 * 60 * 1000;
  // Run once at startup, then on the configured interval
  checkProviderBalances().catch((err) => logger.error({ err }, "Balance monitor error"));
  const balanceTimer = setInterval(() => {
    checkProviderBalances().catch((err) => logger.error({ err }, "Balance monitor error"));
  }, intervalMs);
  logger.info({ intervalHours: config.alerts.intervalHours }, "Balance monitor started");

  process.on("SIGTERM", async () => {
    clearInterval(balanceTimer);
    await Promise.all([
      imageWorker.close(),
      videoWorker.close(),
      audioWorker.close(),
      avatarWorker.close(),
    ]);
    process.exit(0);
  });
} else {
  process.on("SIGTERM", async () => {
    await Promise.all([
      imageWorker.close(),
      videoWorker.close(),
      audioWorker.close(),
      avatarWorker.close(),
    ]);
    process.exit(0);
  });
}
