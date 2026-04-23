import type { Prisma } from "@prisma/client";
import { getImageQueue, getVideoQueue, getAudioQueue, getAvatarQueue } from "@metabox/api/queues";
import { logger } from "../logger.js";

interface GenerationInputData {
  negativePrompt?: string;
  mediaInputs?: Record<string, string[]>;
  modelSettings?: Record<string, unknown>;
  imageUrl?: string;
}

// Minimal shapes — callers may pass full rows or select-subsets as long as
// the fields used inside the functions are present.
export type GenerationJobRow = {
  id: string;
  userId: bigint;
  section: string;
  modelId: string;
  prompt: string;
  inputData: Prisma.JsonValue | null;
  providerJobId: string | null;
  dialogId: string;
};

export type UserAvatarRow = {
  id: string;
  userId: bigint;
  provider: string;
  externalId: string | null;
  providerKeyId: string | null;
};

/**
 * Re-enqueues a single GenerationJob that is stuck in pending/processing.
 * Uses jobId: `recover:${job.id}` so BullMQ silently deduplicates if the
 * entry already exists in the queue (e.g. recovered from AOF by a prior run).
 *
 * Limitation: sourceImageUrl (legacy single-image edits) is not stored in DB
 * and will be undefined on retry — such jobs will fail at the adapter level,
 * which is better than hanging forever.
 */
export async function requeueGenerationJob(job: GenerationJobRow): Promise<void> {
  const inputData = (job.inputData ?? {}) as unknown as GenerationInputData;
  // User.id IS the Telegram user ID for this private bot.
  const telegramChatId = Number(job.userId);
  // If provider already accepted the job, go straight to poll — don't re-submit.
  const stage = job.providerJobId ? "poll" : "generate";

  const dedupeOpts = {
    jobId: `recover:${job.id}`,
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 5000 },
  };

  if (job.section === "image") {
    await getImageQueue().add(
      stage,
      {
        dbJobId: job.id,
        userId: job.userId.toString(),
        modelId: job.modelId,
        prompt: job.prompt,
        negativePrompt: inputData.negativePrompt,
        mediaInputs: inputData.mediaInputs,
        telegramChatId,
        dialogId: job.dialogId,
        modelSettings: inputData.modelSettings,
        stage,
        ...(stage === "poll" ? { pollStartedAt: Date.now() } : {}),
      },
      dedupeOpts,
    );
    return;
  }

  if (job.section === "video") {
    await getVideoQueue().add(
      stage,
      {
        dbJobId: job.id,
        userId: job.userId.toString(),
        modelId: job.modelId,
        prompt: job.prompt,
        imageUrl: inputData.imageUrl,
        mediaInputs: inputData.mediaInputs,
        telegramChatId,
        modelSettings: inputData.modelSettings ?? {},
        stage,
        ...(stage === "poll" ? { pollStartedAt: Date.now() } : {}),
      },
      { ...dedupeOpts, backoff: { type: "exponential" as const, delay: 10000 } },
    );
    return;
  }

  if (job.section === "audio") {
    await getAudioQueue().add(
      stage,
      {
        dbJobId: job.id,
        userId: job.userId.toString(),
        modelId: job.modelId,
        prompt: job.prompt,
        telegramChatId,
        modelSettings: inputData.modelSettings ?? {},
        stage,
      },
      dedupeOpts,
    );
    return;
  }

  logger.warn({ dbJobId: job.id, section: job.section }, "requeue: unknown section, skipping");
}

/**
 * Re-enqueues the poll action for a UserAvatar stuck in 'creating' state.
 * Only possible when externalId is already set (provider accepted the create).
 * Avatars without externalId cannot be recovered — their s3Key is lost.
 */
export async function requeueAvatarPoll(avatar: UserAvatarRow): Promise<void> {
  if (!avatar.externalId) return;

  await getAvatarQueue().add(
    "poll",
    {
      userAvatarId: avatar.id,
      userId: avatar.userId.toString(),
      provider: avatar.provider,
      action: "poll",
      telegramChatId: Number(avatar.userId),
      pollAttempt: 0,
    },
    {
      jobId: `recover:${avatar.id}`,
      attempts: 1,
      removeOnComplete: true,
    },
  );
}
