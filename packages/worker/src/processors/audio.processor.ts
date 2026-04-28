import { UnrecoverableError, DelayedError, type Job } from "bullmq";
import { delayJob } from "../utils/delay-job.js";
import { Api, InputFile } from "grammy";
import type { AudioJobData } from "@metabox/api/queues";
import { getAudioQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createAudioAdapter } from "@metabox/api/ai/audio";
import { deductTokens, calculateCost, translatePromptIfNeeded } from "@metabox/api/services";
import type { DeductResult } from "@metabox/api/services";
import { buildS3Key, uploadBuffer, uploadFromUrl, getFileUrl } from "@metabox/api/services/s3";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT, buildResultCaption } from "@metabox/shared";
import { notifyTechError } from "../utils/notify-error.js";
import { resolveUserFacingMessage, shouldNotifyOps } from "../utils/user-facing-error.js";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import { submitWithThrottle, isRateLimitLongWindowError } from "../utils/submit-with-throttle.js";
import {
  acquireForSubmit,
  acquireForPoll,
  acquireForSubmitSticky,
} from "../utils/acquire-for-processor.js";
import { resolveKeyProvider } from "@metabox/api/ai/key-provider";
import { resolveVoiceForTTS } from "@metabox/api/services/user-voice";
import type { AcquiredKey } from "@metabox/api/services/key-pool";
import { deferIfTransientNetworkError } from "../utils/defer-transient.js";
import { isUniqueViolation } from "../utils/prisma-errors.js";

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
      parse_mode: "HTML",
    });
  } else {
    throw new Error("Audio result has neither buffer nor URL");
  }
}

export async function processAudioJob(job: Job<AudioJobData>, token?: string): Promise<void> {
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
  const keyProvider = resolveKeyProvider(modelId);

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: {
        providerJobId: true,
        providerKeyId: true,
        status: true,
        outputs: { orderBy: { index: "asc" as const }, take: 1 },
      },
    });

    let audioResult: { buffer?: Buffer; url?: string; ext: string; contentType: string } | null =
      null;
    let s3Key: string | null = null;
    let deductResult: DeductResult | undefined;
    const existingOutput = existingJob?.outputs?.[0];

    if (existingOutput) {
      // Crash-recovery fast path. Atomic transition: only one runner wins.
      // count=1 → resumed mid-finalize, deliver result + close row (no deduct).
      // count=0 → already finished, skip to avoid duplicate send.
      const updated = await db.generationJob.updateMany({
        where: { id: dbJobId, status: { in: ["pending", "processing"] } },
        data: { status: "done", completedAt: new Date() },
      });
      if (updated.count === 0) {
        logger.info({ dbJobId }, "Generation already done, skipping duplicate send");
        return;
      }
      logger.warn(
        { dbJobId },
        "Resumed mid-finalize generation: re-sending result to user (tokens NOT deducted — cost context lost)",
      );
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

      // Cloned-voice path: TTS на ElevenLabs с user-cloned voice. Voice_id живёт
      // на конкретном ключе → нужен sticky key. Если voice пропал —
      // resolveVoiceForTTS пересоздаст и вернёт новый voice_id + ключ свежего
      // создания.
      //
      // Современный пикер шлёт `UserVoice.id` (стабильный local cuid).
      // Старые записи в modelSettings могут хранить голый ElevenLabs
      // externalId — пробуем и так, для backward-compat. Если совпадений нет
      // ни по одному полю — это официальный EL-голос, проходит без sticky.
      let stickyVoice: { voiceId: string; acquired: AcquiredKey } | null = null;
      if (modelId === "tts-el" || modelId === "voice-clone") {
        const requestedVoice = (modelSettings?.voice_id as string | undefined) ?? voiceId ?? null;
        if (requestedVoice) {
          const userVoice =
            (await db.userVoice.findFirst({
              where: { id: requestedVoice, provider: "elevenlabs" },
              select: { id: true },
            })) ??
            (await db.userVoice.findFirst({
              where: { provider: "elevenlabs", externalId: requestedVoice },
              select: { id: true },
            }));
          if (userVoice) {
            const resolved = await resolveVoiceForTTS(userVoice.id);
            stickyVoice = { voiceId: resolved.voiceId, acquired: resolved.acquired };
          }
        }
      }

      const acquired = stickyVoice
        ? await acquireForSubmitSticky({
            acquired: stickyVoice.acquired,
            modelId,
            job,
            token,
            queue: getAudioQueue(),
          })
        : await acquireForSubmit({
            provider: keyProvider,
            modelId,
            job,
            token,
            queue: getAudioQueue(),
          });
      const adapter = createAudioAdapter(modelId, acquired);

      // Если был re-clone — подменяем voice_id, чтобы адаптер дернул свежий.
      const effectiveVoiceId = stickyVoice?.voiceId ?? voiceId;
      const effectiveModelSettings = stickyVoice
        ? { ...(modelSettings ?? {}), voice_id: stickyVoice.voiceId }
        : modelSettings;

      if (!adapter.isAsync && adapter.generate) {
        // Sync adapter — generate inline, then fall through to finalize.
        audioResult = await submitWithThrottle({
          modelId,
          provider: modelMeta?.provider,
          section: "audio",
          job,
          token,
          queue: getAudioQueue(),
          keyId: acquired.keyId,
          submit: () =>
            adapter.generate!({
              prompt: effectivePrompt,
              voiceId: effectiveVoiceId,
              sourceAudioUrl,
              modelSettings: effectiveModelSettings,
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
            token,
            queue: getAudioQueue(),
            keyId: acquired.keyId,
            submit: () =>
              adapter.submit!({
                prompt: effectivePrompt,
                voiceId: effectiveVoiceId,
                sourceAudioUrl,
                modelSettings: effectiveModelSettings,
              }),
          });
          await db.generationJob.update({
            where: { id: dbJobId },
            data: {
              providerJobId,
              providerKeyId: acquired.keyId,
              // Фиксируем момент перехода в poll-стадию: после Redis wipe
              // recovery восстановит таймер с этой точки, а не с нуля.
              pollStartedAt: new Date(),
            },
          });
        }

        logger.info({ dbJobId, providerJobId }, "Audio poll scheduled");
        await delayJob(
          job,
          {
            ...job.data,
            stage: "poll",
            pollStartedAt: Date.now(),
            lastIntervalMs: INITIAL_POLL_INTERVAL_MS,
          },
          INITIAL_POLL_INTERVAL_MS,
          token,
        );
      }
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      const providerJobId = existingJob?.providerJobId;
      if (!providerJobId) throw new Error(`Audio poll stage without providerJobId: ${dbJobId}`);

      const acquired = await acquireForPoll(existingJob?.providerKeyId, keyProvider);
      const adapter = createAudioAdapter(modelId, acquired);
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

        await delayJob(
          job,
          { ...job.data, stage: "poll", lastIntervalMs: interval },
          interval,
          token,
        );
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

      try {
        await db.generationJobOutput.create({
          data: { jobId: dbJobId, index: 0, outputUrl: audioResult.url ?? null, s3Key },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Stalled-redelivery race: another runner wrote outputs first. Bail.
          logger.info(
            { dbJobId },
            "Audio finalize: duplicate output detected — another runner is finalizing",
          );
          return;
        }
        throw err;
      }
      // Atomic transition: only one runner wins. Loser bails to avoid
      // double-deduct + duplicate user-send (stalled-redelivery race).
      const updated = await db.generationJob.updateMany({
        where: { id: dbJobId, status: { in: ["pending", "processing"] } },
        data: { status: "done", completedAt: new Date() },
      });
      if (updated.count === 0) {
        logger.info({ dbJobId }, "Audio finalize: job already done by another runner");
        return;
      }

      const model = AI_MODELS[modelId];
      if (model) {
        const internalCost = calculateCost(
          model,
          0,
          0,
          undefined,
          undefined,
          modelSettings,
          undefined,
          prompt.length,
        );
        deductResult = await deductTokens(BigInt(userIdStr), internalCost, modelId);
        await db.generationJob.update({
          where: { id: dbJobId },
          data: { tokensSpent: internalCost },
        });
      }
    }

    const audioModel = AI_MODELS[modelId];
    const audioCaption = buildResultCaption(t, audioModel?.name ?? modelId, prompt, {
      cost: deductResult?.deducted,
      subscriptionBalance: deductResult?.subscriptionTokenBalance,
      tokenBalance: deductResult?.tokenBalance,
    });
    await sendAudio(telegramChatId, audioResult, audioCaption);

    logger.info({ dbJobId }, "Audio job completed");
  } catch (err) {
    if (err instanceof DelayedError) throw err;
    if (isRateLimitLongWindowError(err)) {
      const msg = t.errors.modelTemporarilyUnavailable.replace("{modelName}", modelName);
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: msg },
      });
      await telegram.sendMessage(telegramChatId, msg).catch(() => void 0);
      throw new UnrecoverableError(msg);
    }
    // Throws DelayedError if rescheduled (propagates → BullMQ delays job).
    // Returns silently otherwise → fall through to user-facing failure handling.
    await deferIfTransientNetworkError({ err, job, token, section: "audio" });
    const providerMsg = resolveUserFacingMessage(err, t);
    if (providerMsg !== null) {
      logger.warn({ dbJobId, err }, "Audio job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: providerMsg },
      });
      if (shouldNotifyOps(err)) {
        await notifyTechError(err, {
          jobId: dbJobId,
          modelId,
          section: "audio",
          userId: userIdStr,
          attempt: job.attemptsMade,
        });
      }
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
