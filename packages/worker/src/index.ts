import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { ImageJobData } from "@metabox/api/queues";
import { processImageJob } from "./processors/image.processor.js";
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

logger.info("Worker started — listening on image queue");

process.on("SIGTERM", async () => {
  await imageWorker.close();
  process.exit(0);
});
