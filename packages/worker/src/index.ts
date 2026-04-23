import "dotenv/config";
import { config, preloadLocales } from "@metabox/shared";

await preloadLocales(["ru", "en"]);
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { ImageJobData, VideoJobData, AudioJobData, AvatarJobData } from "@metabox/api/queues";
import { processImageJob } from "./processors/image.processor.js";
import { processVideoJob } from "./processors/video.processor.js";
import { processAudioJob } from "./processors/audio.processor.js";
import { processAvatarJob } from "./processors/avatar.processor.js";
import { checkProviderBalances } from "./monitors/balance.monitor.js";
import { sendUsageReport, msUntilNextMidnightMsk } from "./monitors/usage-report.monitor.js";
import { runWatchdog } from "./monitors/watchdog.monitor.js";
import { reconcileOrphanedJobs } from "./reconcile.js";
import { logger } from "./logger.js";

const connection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});

// Recover jobs orphaned by Redis data loss before accepting new work.
await reconcileOrphanedJobs().catch((err) =>
  logger.error({ err }, "Reconcile failed — continuing startup"),
);

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

// ── Watchdog: re-enqueue stuck jobs, fail dead ones (always active) ──────────
const WATCHDOG_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const watchdogTimer = setInterval(() => {
  runWatchdog().catch((err) => logger.error({ err }, "Watchdog error"));
}, WATCHDOG_INTERVAL_MS);
logger.info("Watchdog started");

// ── Balance monitor ───────────────────────────────────────────────────────────
if (config.alerts.chatId) {
  const intervalMs = config.alerts.intervalHours * 60 * 60 * 1000;
  // Run once at startup, then on the configured interval
  checkProviderBalances().catch((err) => logger.error({ err }, "Balance monitor error"));
  const balanceTimer = setInterval(() => {
    checkProviderBalances().catch((err) => logger.error({ err }, "Balance monitor error"));
  }, intervalMs);
  logger.info({ intervalHours: config.alerts.intervalHours }, "Balance monitor started");

  // ── Daily usage report at 00:00 MSK ──────────────────────────────────────
  let usageReportTimer: ReturnType<typeof setInterval> | undefined;
  const scheduleUsageReport = (): void => {
    const delay = msUntilNextMidnightMsk();
    logger.info({ delayMin: Math.round(delay / 60_000) }, "Usage report scheduled");
    setTimeout(() => {
      sendUsageReport().catch((err) => logger.error({ err }, "Usage report error"));
      usageReportTimer = setInterval(
        () => {
          sendUsageReport().catch((err) => logger.error({ err }, "Usage report error"));
        },
        24 * 60 * 60 * 1000,
      );
    }, delay);
  };
  scheduleUsageReport();

  process.on("SIGTERM", async () => {
    clearInterval(balanceTimer);
    clearInterval(watchdogTimer);
    if (usageReportTimer) clearInterval(usageReportTimer);
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
    clearInterval(watchdogTimer);
    await Promise.all([
      imageWorker.close(),
      videoWorker.close(),
      audioWorker.close(),
      avatarWorker.close(),
    ]);
    process.exit(0);
  });
}
