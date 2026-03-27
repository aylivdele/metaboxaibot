import type { Job } from "bullmq";
import { Api } from "grammy";
import type { AvatarJobData } from "@metabox/api/queues";
import { getAvatarQueue } from "@metabox/api/queues";
import { userAvatarService } from "@metabox/api/services/user-avatar";
import { getFileUrl } from "@metabox/api/services/s3";
import { HeyGenAvatarAdapter } from "@metabox/api/ai/avatar/heygen";
import { logger } from "../logger.js";
import { config } from "@metabox/shared";

const telegram = new Api(config.bot.token);

/** Delay between polls (5 minutes) */
const POLL_DELAY_MS = 1 * 60 * 1000;
/** Maximum poll attempts (~2 hours) */
const MAX_POLL_ATTEMPTS = 30;

function getAdapter(provider: string) {
  if (provider === "heygen") return new HeyGenAvatarAdapter();
  throw new Error(`Unknown avatar provider: ${provider}`);
}

export async function processAvatarJob(job: Job<AvatarJobData>): Promise<void> {
  const {
    userAvatarId,
    provider,
    action,
    imageUrl,
    s3Key,
    telegramChatId,
    pollAttempt = 0,
  } = job.data;

  logger.info({ userAvatarId, provider, action, pollAttempt }, "Processing avatar job");

  const adapter = getAdapter(provider);

  if (action === "create") {
    try {
      // Resolve image URL — prefer fresh presigned URL from S3
      const resolvedUrl = s3Key
        ? ((await getFileUrl(s3Key).catch(() => null)) ?? imageUrl)
        : imageUrl;

      if (!resolvedUrl) throw new Error("No image URL available for avatar creation");

      const imgRes = await fetch(resolvedUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch avatar image: ${imgRes.status}`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

      const { externalId } = await adapter.create(imgBuffer, contentType);

      await userAvatarService.updateStatus(userAvatarId, { status: "creating", externalId });

      // Schedule first poll after 5 minutes
      await getAvatarQueue().add(
        "poll",
        { ...job.data, action: "poll", pollAttempt: 0 },
        { delay: POLL_DELAY_MS },
      );

      logger.info({ userAvatarId, externalId }, "Avatar creation submitted, poll scheduled");
    } catch (err) {
      logger.error({ userAvatarId, err }, "Avatar creation failed");
      await userAvatarService.updateStatus(userAvatarId, { status: "failed" });
      await telegram
        .sendMessage(telegramChatId, "❌ Не удалось создать аватар. Попробуйте снова.")
        .catch(() => void 0);
    }
    return;
  }

  if (action === "poll") {
    try {
      const avatar = await userAvatarService.findById(userAvatarId);
      if (!avatar || !avatar.externalId) {
        logger.warn({ userAvatarId }, "Avatar not found or no externalId, skipping poll");
        return;
      }

      const result = await adapter.poll(avatar.externalId);

      if (result.status === "ready") {
        await userAvatarService.updateStatus(userAvatarId, {
          status: "ready",
          // Use talking_photo_id if returned (HeyGen), otherwise keep the group_id
          externalId: result.talkingPhotoId ?? undefined,
          previewUrl: result.previewUrl,
        });
        await telegram
          .sendMessage(
            telegramChatId,
            "✅ Ваш аватар готов! Откройте настройки HeyGen и выберите его для генерации видео.",
          )
          .catch(() => void 0);
        logger.info({ userAvatarId }, "Avatar ready");
        return;
      }

      if (result.status === "failed") {
        await userAvatarService.updateStatus(userAvatarId, { status: "failed" });
        await telegram
          .sendMessage(telegramChatId, "❌ Не удалось создать аватар. Попробуйте снова.")
          .catch(() => void 0);
        logger.warn({ userAvatarId }, "Avatar processing failed");
        return;
      }

      // Still processing — schedule next poll if under limit
      const nextAttempt = pollAttempt + 1;
      if (nextAttempt >= MAX_POLL_ATTEMPTS) {
        await userAvatarService.updateStatus(userAvatarId, { status: "failed" });
        await telegram
          .sendMessage(
            telegramChatId,
            "❌ Аватар не был создан в отведённое время. Попробуйте снова.",
          )
          .catch(() => void 0);
        logger.warn({ userAvatarId }, "Avatar poll timed out");
        return;
      }

      await getAvatarQueue().add(
        "poll",
        { ...job.data, action: "poll", pollAttempt: nextAttempt },
        { delay: POLL_DELAY_MS },
      );

      logger.info({ userAvatarId, nextAttempt }, "Avatar still processing, rescheduled");
    } catch (err) {
      logger.error({ userAvatarId, err }, "Avatar poll error");
      // Re-schedule on error (non-fatal) if under limit
      const nextAttempt = pollAttempt + 1;
      if (nextAttempt < MAX_POLL_ATTEMPTS) {
        await getAvatarQueue()
          .add(
            "poll",
            { ...job.data, action: "poll", pollAttempt: nextAttempt },
            { delay: POLL_DELAY_MS },
          )
          .catch(() => void 0);
      }
    }
  }
}
