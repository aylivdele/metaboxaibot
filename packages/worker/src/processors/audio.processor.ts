import type { Job } from "bullmq";
import { Api, InputFile } from "grammy";
import type { AudioJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createAudioAdapter } from "@metabox/api/ai/audio";
import { deductTokens, calculateCost } from "@metabox/api/services";
import { buildS3Key, uploadBuffer, uploadFromUrl, getFileUrl } from "@metabox/api/services/s3";
import { logger } from "../logger.js";
import { config, AI_MODELS } from "@metabox/shared";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // 6 minutes max

const telegram = new Api(config.bot.token);

async function sendAudio(
  chatId: number,
  result: { buffer?: Buffer; url?: string; ext: string; contentType: string },
  caption: string,
): Promise<void> {
  if (result.buffer) {
    await telegram.sendAudio(chatId, new InputFile(result.buffer, `audio.${result.ext}`), {
      caption,
    });
  } else if (result.url) {
    await telegram.sendAudio(chatId, result.url, { caption });
  } else {
    throw new Error("Audio result has neither buffer nor URL");
  }
}

export async function processAudioJob(job: Job<AudioJobData>): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    voiceId,
    sourceAudioUrl,
    telegramChatId,
    modelSettings,
  } = job.data;

  logger.info({ dbJobId, modelId }, "Processing audio job");

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createAudioAdapter(modelId);

  try {
    // On retry: if generation already completed, skip submit/poll
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: { outputUrl: true, s3Key: true },
    });

    let audioResult: { buffer?: Buffer; url?: string; ext: string; contentType: string };
    let s3Key: string | null;

    if (existingJob?.outputUrl || existingJob?.s3Key) {
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      // Reconstruct a minimal audioResult to pass to sendAudio
      const ext = existingJob.s3Key?.split(".").pop() ?? "mp3";
      const resolvedUrl = existingJob.s3Key
        ? ((await getFileUrl(existingJob.s3Key).catch(() => null)) ??
          existingJob.outputUrl ??
          undefined)
        : (existingJob.outputUrl ?? undefined);
      audioResult = { url: resolvedUrl, ext, contentType: `audio/${ext}` };
      s3Key = existingJob.s3Key ?? null;
    } else {
      if (!adapter.isAsync && adapter.generate) {
        // Sync adapter (should not normally end up in queue, but handle gracefully)
        audioResult = await adapter.generate({ prompt, voiceId, sourceAudioUrl, modelSettings });
      } else {
        // Async adapter (Suno)
        if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);
        const providerJobId = await adapter.submit({
          prompt,
          voiceId,
          sourceAudioUrl,
          modelSettings,
        });

        let polled = null;
        for (let i = 0; i < MAX_POLLS; i++) {
          await sleep(POLL_INTERVAL_MS);
          polled = await adapter.poll!(providerJobId);
          if (polled) break;
        }

        if (!polled) throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
        audioResult = polled;
      }

      const audioKey = buildS3Key("audio", userIdStr, dbJobId, audioResult.ext ?? "mp3");
      s3Key = await (
        audioResult.buffer
          ? uploadBuffer(audioKey, audioResult.buffer, `audio/${audioResult.ext ?? "mpeg"}`)
          : audioResult.url
            ? uploadFromUrl(audioKey, audioResult.url, `audio/${audioResult.ext ?? "mpeg"}`)
            : Promise.resolve(null)
      ).catch(() => null);

      await db.generationJob.update({
        where: { id: dbJobId },
        data: {
          status: "done",
          outputUrl: audioResult.url ?? null,
          s3Key,
          completedAt: new Date(),
        },
      });

      const model = AI_MODELS[modelId];
      if (model) {
        await deductTokens(
          BigInt(userIdStr),
          calculateCost(model, 0, 0, undefined, undefined, modelSettings, undefined, prompt.length),
          modelId,
        );
      }
    }

    await sendAudio(telegramChatId, audioResult, `✅ ${modelId}: ${prompt.slice(0, 200)}`);

    logger.info({ dbJobId }, "Audio job completed");
  } catch (err) {
    logger.error({ dbJobId, err }, "Audio job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      const errMsg = err instanceof Error ? err.message : String(err);
      let userMessage = "❌ Ошибка при генерации, попробуйте позже или обратитесь в поддержку.";
      if (errMsg.includes("SENSITIVE_WORD_ERROR")) {
        userMessage =
          "❌ Запрос содержит запрещённый контент (авторские права или ограниченные слова). Измените описание и попробуйте снова.";
      } else if (errMsg.includes("GENERATE_AUDIO_FAILED")) {
        userMessage = "❌ Провайдер не смог сгенерировать аудио. Попробуйте изменить запрос.";
      } else if (errMsg.includes("CREATE_TASK_FAILED")) {
        userMessage = "❌ Не удалось создать задачу генерации. Попробуйте позже.";
      } else if (errMsg.includes("Timed out")) {
        userMessage = "❌ Генерация заняла слишком долго. Попробуйте снова.";
      }

      await telegram.sendMessage(telegramChatId, userMessage).catch(() => void 0);
    }

    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
