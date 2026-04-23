import { Api } from "grammy";
import { db } from "@metabox/api/db";
import { getImageQueue, getVideoQueue, getAudioQueue, getAvatarQueue } from "@metabox/api/queues";
import type { Queue } from "bullmq";
import { config, AI_MODELS, getT } from "@metabox/shared";
import type { Language } from "@metabox/shared";
import { logger } from "../logger.js";
import { notifyTechError } from "../utils/notify-error.js";
import { requeueGenerationJob, requeueAvatarPoll } from "../utils/requeue-job.js";

/** Re-enqueue generation jobs stuck between 1h and 24h. */
const REQUEUE_MIN_AGE_MS = 60 * 60 * 1000; // 1h
const REQUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
/** Re-enqueue avatar polls stuck under 6h. */
const AVATAR_REQUEUE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

const telegram = new Api(config.bot.token);

function getGenerationQueue(section: string): Queue | null {
  if (section === "image") return getImageQueue();
  if (section === "video") return getVideoQueue();
  if (section === "audio") return getAudioQueue();
  return null;
}

async function getUserLang(userId: bigint): Promise<Language> {
  return db.user
    .findUnique({ where: { id: userId }, select: { language: true } })
    .then((u) => (u?.language ?? "ru") as Language);
}

/**
 * Periodic safety net (10-min cadence):
 *  1. Re-enqueue generation jobs in DB pending/processing for 1h–24h.
 *     `requeueGenerationJob` does its own getJob(id) dedup — safe to spam.
 *  2. Hard-fail jobs older than 24h that aren't in BullMQ (handler will never
 *     fire for them, in-handler 24h timeout can't help). Notifies the user
 *     instead of leaving "⌛ генерируется" forever.
 *  3. Re-enqueue avatar polls under 6h that have an externalId.
 *  4. Hard-fail avatars older than 6h with no queue entry — including
 *     create-stage orphans (s3Keys not persisted in DB, no recovery possible).
 *
 * Uses jobId = dbJobId everywhere so BullMQ native dedup silently skips
 * already-queued jobs. Single notifyTechError per run summarises hard-fails.
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

  // ── 2. Hard-fail generation jobs older than 24h not present in BullMQ ──────
  // Per-processor 24h timeout only fires when handler runs. If the job is gone
  // from Redis, no handler ever runs — the row would hang in `processing`
  // forever. Belt-and-suspenders: skip if still alive in queue.
  const deadJobs = await db.generationJob.findMany({
    where: {
      status: { in: ["pending", "processing"] },
      createdAt: { lte: failOlderThan },
    },
    select: { id: true, userId: true, section: true, modelId: true },
  });

  let killedJobs = 0;
  await Promise.allSettled(
    deadJobs.map(async (job) => {
      const queue = getGenerationQueue(job.section);
      if (queue) {
        const existing = await queue.getJob(job.id);
        if (existing) return; // alive — let in-handler 24h timeout fail it
      }

      await db.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", error: "watchdog: orphaned >24h" },
      });
      killedJobs += 1;

      const lang = await getUserLang(job.userId);
      const t = getT(lang);
      const modelName = AI_MODELS[job.modelId]?.name ?? job.modelId;
      await telegram
        .sendMessage(
          Number(job.userId),
          t.errors.generationTimedOut24h.replace("{modelName}", modelName),
        )
        .catch(() => void 0);

      logger.warn(
        { dbJobId: job.id, section: job.section, modelId: job.modelId },
        "Watchdog: hard-failed orphaned generation job (>24h)",
      );
    }),
  );

  // ── 3. Re-enqueue avatar polls stuck under 6h ───────────────────────────────
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

  // ── 4. Hard-fail avatars older than 6h not present in BullMQ ───────────────
  // Covers two cases:
  //   - poll-stage orphans where re-enqueue keeps failing for >6h
  //   - create-stage orphans without externalId (s3Keys not in DB → no
  //     recovery possible, only option is fail+notify)
  const deadAvatars = await db.userAvatar.findMany({
    where: {
      status: "creating",
      createdAt: { lte: avatarFailOlderThan },
    },
    select: { id: true, userId: true, provider: true },
  });

  let killedAvatars = 0;
  await Promise.allSettled(
    deadAvatars.map(async (avatar) => {
      const existing = await getAvatarQueue().getJob(avatar.id);
      if (existing) return; // alive — let MAX_POLL_ATTEMPTS in handler fail it

      await db.userAvatar.update({
        where: { id: avatar.id },
        data: { status: "failed" },
      });
      killedAvatars += 1;

      const lang = await getUserLang(avatar.userId);
      const t = getT(lang);
      const msg = avatar.provider === "higgsfield_soul" ? t.video.soulFailed : t.video.avatarFailed;
      await telegram.sendMessage(Number(avatar.userId), msg).catch(() => void 0);

      logger.warn(
        { userAvatarId: avatar.id, provider: avatar.provider },
        "Watchdog: hard-failed orphaned avatar (>6h)",
      );
    }),
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  if (killedJobs > 0 || killedAvatars > 0) {
    await notifyTechError(
      new Error(
        `Watchdog hard-failed ${killedJobs} generation job(s) and ${killedAvatars} avatar(s) (orphaned past timeout)`,
      ),
      { section: "watchdog" },
    ).catch(() => void 0);
  }
}
