import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { ImageJobData, VideoJobData } from "@metabox/api/queues";
import { processImageJob } from "./processors/image.processor.js";
import { processVideoJob } from "./processors/video.processor.js";
import { logger } from "./logger.js";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
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

logger.info("Worker started — listening on image and video queues");

process.on("SIGTERM", async () => {
  await Promise.all([imageWorker.close(), videoWorker.close()]);
  process.exit(0);
});
