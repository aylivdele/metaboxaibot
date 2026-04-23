import { Api } from "grammy";
import { db } from "@metabox/api/db";
import { config, AI_MODELS, getT } from "@metabox/shared";
import type { Language } from "@metabox/shared";
import { logger } from "../logger.js";
import { notifyTechError } from "../utils/notify-error.js";
import { requeueGenerationJob, requeueAvatarPoll } from "../utils/requeue-job.js";

const telegram = new Api(config.bot.token);

/** Jobs older than this are re-enqueued if still pending/processing. */
const REQUEUE_MIN_AGE_MS = 60 * 60 * 1000; // 1h
/** Jobs older than this are declared dead and marked failed. */
const FAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
/** Avatars stuck in 'creating' longer than this are marked failed. */
const AVATAR_FAIL_AGE_MS = 6 * 60 * 60 * 1000; // 6h

async function getUserLang(userId: bigint): Promise<Language> {
  return db.user
    .findUnique({ where: { id: userId }, select: { language: true } })
    .then((u) => (u?.language ?? "ru") as Language);
}

export async function runWatchdog(): Promise<void> {
  const now = new Date();

  const requeueOlderThan = new Date(now.getTime() - REQUEUE_MIN_AGE_MS);
  const failOlderThan = new Date(now.getTime() - FAIL_MAX_AGE_MS);
  const avatarFailOlderThan = new Date(now.getTime() - AVATAR_FAIL_AGE_MS);

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
      status: true,
      createdAt: true,
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

  // ── 2. Mark dead generation jobs (> 24h) as failed + notify user ────────────
  const deadJobs = await db.generationJob.findMany({
    where: {
      status: { in: ["pending", "processing"] },
      createdAt: { lte: failOlderThan },
    },
    select: {
      id: true,
      userId: true,
      section: true,
      modelId: true,
    },
  });

  if (deadJobs.length > 0) {
    await Promise.allSettled(
      deadJobs.map(async (job) => {
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "failed", error: "watchdog timeout: job stuck >24h" },
        });

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
          "Watchdog: marked generation job as failed (>24h)",
        );
      }),
    );

    await notifyTechError(
      new Error(`Watchdog killed ${deadJobs.length} stuck generation job(s) (>24h)`),
      { section: "watchdog" },
    ).catch(() => void 0);
  }

  // ── 3. Re-enqueue avatar polls stuck < 6h ───────────────────────────────────
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
      createdAt: true,
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
            logger.error(
              { userAvatarId: avatar.id, err },
              "Watchdog: failed to re-enqueue avatar poll",
            );
          }),
      ),
  );

  // ── 4. Mark dead avatars (> 6h) as failed + notify user ─────────────────────
  const deadAvatars = await db.userAvatar.findMany({
    where: {
      status: "creating",
      createdAt: { lte: avatarFailOlderThan },
    },
    select: {
      id: true,
      userId: true,
      provider: true,
    },
  });

  if (deadAvatars.length > 0) {
    await Promise.allSettled(
      deadAvatars.map(async (avatar) => {
        await db.userAvatar.update({
          where: { id: avatar.id },
          data: { status: "failed" },
        });

        const lang = await getUserLang(avatar.userId);
        const t = getT(lang);
        const msg =
          avatar.provider === "higgsfield_soul" ? t.video.soulFailed : t.video.avatarFailed;

        await telegram.sendMessage(Number(avatar.userId), msg).catch(() => void 0);

        logger.warn(
          { userAvatarId: avatar.id, provider: avatar.provider },
          "Watchdog: marked avatar as failed (>6h)",
        );
      }),
    );

    await notifyTechError(
      new Error(`Watchdog killed ${deadAvatars.length} stuck avatar(s) (>6h)`),
      { section: "watchdog" },
    ).catch(() => void 0);
  }
}
