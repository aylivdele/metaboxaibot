import { db } from "@metabox/api/db";
import { logger } from "../logger.js";
import { requeueGenerationJob, requeueAvatarPoll } from "../utils/requeue-job.js";

/** Re-enqueue generation jobs stuck between 1h and 24h. */
const REQUEUE_MIN_AGE_MS = 60 * 60 * 1000; // 1h
const REQUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
/** Re-enqueue avatar polls stuck under 6h. */
const AVATAR_REQUEUE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Periodic safety net: re-enqueues jobs that appear stuck in DB but may have
 * lost their queue entry. Uses jobId = dbJobId so BullMQ native dedup silently
 * skips jobs that are already alive in the queue (active/waiting/delayed).
 * The 1h threshold is safe because dedup prevents double-processing.
 */
export async function runWatchdog(): Promise<void> {
  const now = new Date();
  const requeueOlderThan = new Date(now.getTime() - REQUEUE_MIN_AGE_MS);
  const failOlderThan = new Date(now.getTime() - REQUEUE_MAX_AGE_MS);
  const avatarFailOlderThan = new Date(now.getTime() - AVATAR_REQUEUE_MAX_AGE_MS);

  // ── 1. Re-enqueue generation jobs stuck between 1h and 24h ─────────────────
  const stuckJobs = await db.generationJob.findMany({
    where: {
      status: { in: ["pending", "processing"] },
      createdAt: { gt: failOlderThan, lt: requeueOlderThan },
    },
    select: {
      id: true,
      userId: true,
      section: true,
      modelId: true,
      prompt: true,
      inputData: true,
      providerJobId: true,
      dialogId: true,
    },
  });

  await Promise.allSettled(
    stuckJobs.map((job) =>
      requeueGenerationJob(job)
        .then(() => {
          logger.warn(
            { dbJobId: job.id, section: job.section, modelId: job.modelId },
            "Watchdog: re-enqueued stuck generation job",
          );
        })
        .catch((err) => {
          logger.error({ dbJobId: job.id, err }, "Watchdog: failed to re-enqueue generation job");
        }),
    ),
  );

  // ── 2. Re-enqueue avatar polls stuck under 6h ───────────────────────────────
  const stuckAvatars = await db.userAvatar.findMany({
    where: {
      status: "creating",
      createdAt: { gt: avatarFailOlderThan },
    },
    select: {
      id: true,
      userId: true,
      provider: true,
      externalId: true,
      providerKeyId: true,
    },
  });

  await Promise.allSettled(
    stuckAvatars
      .filter((a) => a.externalId)
      .map((avatar) =>
        requeueAvatarPoll(avatar)
          .then(() => {
            logger.warn(
              { userAvatarId: avatar.id, provider: avatar.provider },
              "Watchdog: re-enqueued stuck avatar poll",
            );
          })
          .catch((err) => {
            logger.error({ userAvatarId: avatar.id, err }, "Watchdog: failed to re-enqueue avatar");
          }),
      ),
  );
}
