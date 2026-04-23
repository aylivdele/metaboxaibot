import { db } from "@metabox/api/db";
import { logger } from "./logger.js";
import { requeueGenerationJob, requeueAvatarPoll } from "./utils/requeue-job.js";

const GENERATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const AVATAR_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h

/**
 * On startup: scans DB for jobs stuck in pending/processing and re-enqueues them.
 * Uses jobId = dbJobId so BullMQ native dedup silently skips already-queued jobs —
 * safe to run on every restart, not only after Redis data loss.
 */
export async function reconcileOrphanedJobs(): Promise<void> {
  logger.info("Reconcile: scanning for orphaned jobs...");

  const now = new Date();
  const generationCutoff = new Date(now.getTime() - GENERATION_WINDOW_MS);
  const avatarCutoff = new Date(now.getTime() - AVATAR_WINDOW_MS);

  const [stuckJobs, stuckAvatars] = await Promise.all([
    db.generationJob.findMany({
      where: {
        status: { in: ["pending", "processing"] },
        createdAt: { gt: generationCutoff },
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
    }),
    db.userAvatar.findMany({
      where: {
        status: "creating",
        createdAt: { gt: avatarCutoff },
      },
      select: {
        id: true,
        userId: true,
        provider: true,
        externalId: true,
        providerKeyId: true,
      },
    }),
  ]);

  logger.info(
    { stuckJobs: stuckJobs.length, stuckAvatars: stuckAvatars.length },
    "Reconcile: found orphaned records",
  );

  if (stuckJobs.length === 0 && stuckAvatars.length === 0) return;

  const jobResults = await Promise.allSettled(
    stuckJobs.map((job) =>
      requeueGenerationJob(job).then(() => {
        logger.info(
          { dbJobId: job.id, section: job.section, modelId: job.modelId },
          "Reconcile: re-enqueued generation job",
        );
      }),
    ),
  );

  const avatarResults = await Promise.allSettled(
    stuckAvatars.map((avatar) => {
      if (!avatar.externalId) {
        logger.warn(
          { userAvatarId: avatar.id },
          "Reconcile: avatar has no externalId, skipping — stalled mechanism will recover if create job is still active",
        );
        return Promise.resolve();
      }
      return requeueAvatarPoll(avatar).then(() => {
        logger.info(
          { userAvatarId: avatar.id, provider: avatar.provider },
          "Reconcile: re-enqueued avatar poll",
        );
      });
    }),
  );

  const failures = [...jobResults, ...avatarResults].filter((r) => r.status === "rejected");
  for (const f of failures) {
    logger.error({ err: (f as PromiseRejectedResult).reason }, "Reconcile: failed to re-enqueue");
  }

  logger.info(
    {
      requeued: stuckJobs.length + stuckAvatars.length - failures.length,
      failed: failures.length,
    },
    "Reconcile: complete",
  );
}
