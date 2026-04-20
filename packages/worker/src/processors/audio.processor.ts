import { UnrecoverableError, type Job } from "bullmq";
import { Api, InputFile } from "grammy";
import type { AudioJobData } from "@metabox/api/queues";
import { getAudioQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createAudioAdapter } from "@metabox/api/ai/audio";
import { deductTokens, calculateCost, translatePromptIfNeeded } from "@metabox/api/services";
import type { DeductResult } from "@metabox/api/services";
import { buildS3Key, uploadBuffer, uploadFromUrl, getFileUrl } from "@metabox/api/services/s3";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT } from "@metabox/shared";
import { notifyTechError } from "../utils/notify-error.js";
import { resolveUserFacingMessage } from "../utils/user-facing-error.js";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import {
  submitWithThrottle,
  isRateLimitDeferredError,
  isRateLimitLongWindowError,
} from "../utils/submit-with-throttle.js";

const INITIAL_POLL_INTERVAL_MS = 5000;

const telegram = new Api(config.bot.token);

async function sendAudio(
  chatId: number,
  result: { buffer?: Buffer; url?: string; ext: string; contentType: string },
  caption: string,
): Promise<void> {
  let buf = result.buffer;
  if (!buf && result.url) {
    const res = await fetch(result.url);
    if (!res.ok) throw new Error(`Failed to fetch audio from provider: ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  if (buf) {
    await telegram.sendAudio(chatId, new InputFile(buf, `audio.${result.ext}`), {
      caption,
    });
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

  const stage = job.data.stage ?? "generate";

  logger.info({ dbJobId, modelId, stage }, "Processing audio job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);
  const modelMeta = AI_MODELS[modelId];
  const modelName = modelMeta?.name ?? modelId;

  const adapter = createAudioAdapter(modelId);

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: {
        providerJobId: true,
        status: true,
        outputs: { orderBy: { index: "asc" as const }, take: 1 },
      },
    });

    let audioResult: { buffer?: Buffer; url?: string; ext: string; contentType: string } | null =
      null;
    let s3Key: string | null = null;
    const existingOutput = existingJob?.outputs?.[0];

    if (existingOutput) {
      logger.info({ dbJobId }, "Generation already done, skipping to send");
      const ext = existingOutput.s3Key?.split(".").pop() ?? "mp3";
      const resolvedUrl = existingOutput.s3Key
        ? ((await getFileUrl(existingOutput.s3Key).catch(() => null)) ??
          existingOutput.outputUrl ??
          undefined)
        : (existingOutput.outputUrl ?? undefined);
      audioResult = { url: resolvedUrl, ext, contentType: `audio/${ext}` };
      s3Key = existingOutput.s3Key ?? null;
    } else if (stage === "generate") {
      // ── Stage 1: submit (or sync-generate) ────────────────────────────
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "processing" },
      });

      const effectivePrompt = await translatePromptIfNeeded(
        prompt,
        modelSettings,
        BigInt(userIdStr),
        modelId,
      );

      if (!adapter.isAsync && adapter.generate) {
        // Sync adapter — generate inline, then fall through to finalize.
        audioResult = await submitWithThrottle({
          modelId,
          provider: modelMeta?.provider,
          section: "audio",
          job,
          queue: getAudioQueue(),
          submit: () =>
            adapter.generate!({
              prompt: effectivePrompt,
              voiceId,
              sourceAudioUrl,
              modelSettings,
            }),
        });
      } else {
        // Async adapter (Suno) — submit then schedule poll.
        if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);

        let providerJobId: string;
        if (existingJob?.providerJobId) {
          providerJobId = existingJob.providerJobId;
          logger.info({ dbJobId, providerJobId }, "Resuming poll for existing provider job");
        } else {
          providerJobId = await submitWithThrottle({
            modelId,
            provider: modelMeta?.provider,
            section: "audio",
            job,
            queue: getAudioQueue(),
            submit: () =>
              adapter.submit!({
                prompt: effectivePrompt,
                voiceId,
                sourceAudioUrl,
                modelSettings,
              }),
          });
          await db.generationJob.update({
            where: { id: dbJobId },
            data: { providerJobId },
          });
        }

        await getAudioQueue().add(
          "poll",
          {
            ...job.data,
            stage: "poll",
            pollStartedAt: Date.now(),
            lastIntervalMs: INITIAL_POLL_INTERVAL_MS,
          },
          { delay: INITIAL_POLL_INTERVAL_MS, attempts: 1, removeOnComplete: true },
        );
        logger.info({ dbJobId, providerJobId }, "Audio poll scheduled");
        return;
      }
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      const providerJobId = existingJob?.providerJobId;
      if (!providerJobId) throw new Error(`Audio poll stage without providerJobId: ${dbJobId}`);
      if (!adapter.poll) throw new Error(`Adapter ${modelId} has no poll()`);

      audioResult = await adapter.poll(providerJobId);

      if (!audioResult) {
        const elapsed = Date.now() - (job.data.pollStartedAt ?? Date.now());
        const interval = getIntervalForElapsed(elapsed);

        if (interval === null) {
          await db.generationJob.update({
            where: { id: dbJobId },
            data: { status: "failed", error: "poll timeout (24h)" },
          });
          await telegram
            .sendMessage(
              telegramChatId,
              t.errors.generationTimedOut24h.replace("{modelName}", modelName),
            )
            .catch(() => void 0);
          throw new UnrecoverableError("poll timeout 24h");
        }

        if (job.data.lastIntervalMs !== undefined && interval !== job.data.lastIntervalMs) {
          await telegram
            .sendMessage(
              telegramChatId,
              t.errors.generationStillRunning.replace("{modelName}", modelName),
            )
            .catch(() => void 0);
        }

        await getAudioQueue().add(
          "poll",
          { ...job.data, stage: "poll", lastIntervalMs: interval },
          { delay: interval, attempts: 1, removeOnComplete: true },
        );
        return;
      }
    }

    if (!audioResult) {
      throw new Error(`Audio job ${dbJobId}: no result after stage ${stage}`);
    }

    // ── Stage 3: upload + deduct (when not already persisted) ───────────
    if (!existingOutput) {
      const audioKey = buildS3Key("audio", userIdStr, dbJobId, audioResult.ext ?? "mp3");
      s3Key = await (
        audioResult.buffer
          ? uploadBuffer(audioKey, audioResult.buffer, `audio/${audioResult.ext ?? "mpeg"}`)
          : audioResult.url
            ? uploadFromUrl(audioKey, audioResult.url, `audio/${audioResult.ext ?? "mpeg"}`)
            : Promise.resolve(null)
      ).catch(() => null);

      await db.generationJobOutput.create({
        data: { jobId: dbJobId, index: 0, outputUrl: audioResult.url ?? null, s3Key },
      });
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "done", completedAt: new Date() },
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
    if (isRateLimitDeferredError(err)) {
      logger.info({ dbJobId, modelId, delayMs: err.delayMs }, "Audio job deferred by throttle");
      return;
    }
    if (isRateLimitLongWindowError(err)) {
      const msg = t.errors.modelTemporarilyUnavailable.replace("{modelName}", modelName);
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: msg },
      });
      await telegram.sendMessage(telegramChatId, msg).catch(() => void 0);
      throw new UnrecoverableError(msg);
    }
    const providerMsg = resolveUserFacingMessage(err, t);
    if (providerMsg !== null) {
      logger.warn({ dbJobId, err }, "Audio job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: providerMsg },
      });
      await telegram.sendMessage(telegramChatId, providerMsg).catch(() => void 0);
      throw new UnrecoverableError(providerMsg);
    }

    logger.error({ dbJobId, err }, "Audio job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      const errMsg = err instanceof Error ? err.message : String(err);

      let userMessage: string | null = null;
      if (errMsg.includes("SENSITIVE_WORD_ERROR")) {
        userMessage = t.errors.audioSensitiveWord;
      } else if (errMsg.includes("GENERATE_AUDIO_FAILED")) {
        userMessage = t.errors.audioGenerateFailed;
      } else if (errMsg.includes("CREATE_TASK_FAILED")) {
        userMessage = t.errors.audioCreateTaskFailed;
      } else if (errMsg.includes("Timed out")) {
        userMessage = t.errors.generationTimeout;
      }

      const isKnownError = userMessage !== null;

      if (!isKnownError) {
        await notifyTechError(err, {
          jobId: dbJobId,
          modelId,
          section: "audio",
          userId: userIdStr,
          attempt: job.attemptsMade,
        });
      }

      await telegram
        .sendMessage(
          telegramChatId,
          userMessage ?? t.errors.generationFailed.replace("{modelName}", modelName),
        )
        .catch(() => void 0);
    }

    throw err;
  }
}
