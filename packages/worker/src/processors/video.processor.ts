import { UnrecoverableError, DelayedError } from "bullmq";
import type { Job } from "bullmq";
import { delayJob } from "../utils/delay-job.js";
import { resolveUserFacingMessage, shouldNotifyOps } from "../utils/user-facing-error.js";
import { isHeyGenProviderUnavailable } from "@metabox/api/utils/heygen-error";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import { Api } from "grammy";
import type { VideoJobData } from "@metabox/api/queues";
import { getVideoQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createVideoAdapter } from "@metabox/api/ai/video";
import {
  deductTokens,
  calculateCost,
  computeVideoTokens,
  translatePromptIfNeeded,
} from "@metabox/api/services";
import type { DeductResult } from "@metabox/api/services";
import {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  getFileUrl,
  generateVideoThumbnail,
  generateVideoJpegThumbnail,
  remuxToFaststart,
} from "@metabox/api/services/s3";
import { buildDownloadButton } from "@metabox/api/utils/download-token";
import { isUniqueViolation } from "../utils/prisma-errors.js";
import { InputFile } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { parseMp4Info } from "@metabox/api/utils/mp4-duration";
import { logger } from "../logger.js";
import {
  config,
  AI_MODELS,
  getT,
  buildResultCaption,
  getFallbackCandidates,
  isFallbackCompatible,
} from "@metabox/shared";
import type { AIModel } from "@metabox/shared";
import { notifyTechError } from "../utils/notify-error.js";
import { submitWithThrottle, isRateLimitLongWindowError } from "../utils/submit-with-throttle.js";
import { submitWithFallback } from "../utils/submit-with-fallback.js";
import {
  acquireForSubmit,
  acquireForPoll,
  acquireForSubmitSticky,
} from "../utils/acquire-for-processor.js";
import { resolveKeyProvider, resolveKeyProviderForModel } from "@metabox/api/ai/key-provider";
import { acquireById } from "@metabox/api/services/key-pool";
import type { AcquiredKey } from "@metabox/api/services/key-pool";
import type { Prisma } from "@prisma/client";
import { userAvatarService } from "@metabox/api/services/user-avatar";
import { resolveVoiceForTTS } from "@metabox/api/services/user-voice";
import { deferIfTransientNetworkError } from "../utils/defer-transient.js";
import { UserFacingError } from "@metabox/shared";

const INITIAL_POLL_INTERVAL_MS = 5000;

const telegram = new Api(config.bot.token);

export async function processVideoJob(job: Job<VideoJobData>, token?: string): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    imageUrl,
    mediaInputs,
    telegramChatId,
    sendOriginalLabel,
    aspectRatio,
    duration,
    modelSettings,
  } = job.data;

  const stage = job.data.stage ?? "generate";

  logger.info({ dbJobId, modelId, stage }, "Processing video job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);
  const modelMeta = AI_MODELS[modelId];
  const modelName = modelMeta?.name ?? modelId;
  const keyProvider = resolveKeyProvider(modelId);

  // Fallback кандидаты: если у задачи есть mediaInputs (image-to-video и т.п.),
  // fallback должен поддерживать те же слоты. HeyGen с user avatar и аналогичные
  // sticky-провайдеры не получают fallback (их fallback массив пуст).
  const fallbackCandidates: AIModel[] = modelMeta
    ? getFallbackCandidates(modelId, "video").filter((m) => isFallbackCompatible(m, mediaInputs))
    : [];

  /** Подобрать AIModel по provider строке (primary или один из fallback'ов). */
  const findModelByProvider = (provider: string): AIModel | undefined => {
    if (modelMeta?.provider === provider) return modelMeta;
    return fallbackCandidates.find((m) => m.provider === provider);
  };

  /**
   * State-shape `inputData.fallback`. Не вводим отдельный type — используем
   * inline-формат как в image processor'е.
   */
  interface FallbackState {
    primaryProvider: string;
    effectiveProvider?: string;
    attemptedProviders?: string[];
  }

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: {
        providerJobId: true,
        providerKeyId: true,
        status: true,
        inputData: true,
        outputs: { orderBy: { index: "asc" as const }, take: 1 },
      },
    });

    /** Прочитать fallback state из inputData. */
    const readFallbackState = (): FallbackState => {
      const raw = (existingJob?.inputData as Record<string, unknown> | null | undefined)
        ?.fallback as FallbackState | undefined;
      return { primaryProvider: modelMeta?.provider ?? "", ...(raw ?? {}) };
    };

    /** Записать fallback state в inputData (мерджится). */
    const writeFallbackState = async (next: FallbackState): Promise<void> => {
      const current = await db.generationJob.findUnique({
        where: { id: dbJobId },
        select: { inputData: true },
      });
      const merged = {
        ...((current?.inputData as Record<string, unknown> | null | undefined) ?? {}),
        fallback: next,
      };
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { inputData: merged as unknown as Prisma.InputJsonValue },
      });
      if (existingJob) {
        (existingJob.inputData as unknown) = merged;
      }
    };

    let outputUrl: string;
    let s3Key: string | null;
    let outputId: string;
    let videoBuffer: Buffer | null = null;
    let videoResult: Awaited<ReturnType<ReturnType<typeof createVideoAdapter>["poll"]>> | null =
      null;
    let deductResult: DeductResult | undefined;
    let pollAdapter: ReturnType<typeof createVideoAdapter> | null = null;

    if (existingJob?.outputs?.length) {
      // Crash-recovery fast path. Atomic transition: only one runner wins.
      // count=1 → we resumed mid-finalize, deliver result + close row (no
      // deduct, cost context lost). count=0 → another runner already finished,
      // skip to avoid duplicate send.
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
      outputUrl = existingJob.outputs[0].outputUrl ?? "";
      s3Key = existingJob.outputs[0].s3Key ?? null;
      outputId = existingJob.outputs[0].id;
    } else if (stage === "generate") {
      // ── Stage 1: submit ────────────────────────────────────────────────
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "processing" },
      });

      let providerJobId: string;
      if (existingJob?.providerJobId) {
        providerJobId = existingJob.providerJobId;
        logger.info({ dbJobId, providerJobId }, "Resuming poll for existing provider job");
      } else {
        const effectivePrompt = await translatePromptIfNeeded(
          prompt,
          modelSettings,
          BigInt(userIdStr),
          modelId,
        );

        // HeyGen с user-avatar (talking_photo): аватар живёт на конкретном
        // ключе, на котором был создан. Sticky-acquire по providerKeyId аватара.
        // Если ключ удалён → markOrphaned + UserFacingError.
        let stickyAvatar: { acquired: AcquiredKey; userAvatarId: string } | null = null;
        if (modelId === "heygen") {
          const candidateAvatarId = (modelSettings?.avatar_id as string | undefined)?.trim();
          if (candidateAvatarId) {
            const userAvatar = await db.userAvatar.findFirst({
              where: {
                userId: BigInt(userIdStr),
                provider: "heygen",
                externalId: candidateAvatarId,
              },
              select: { id: true, providerKeyId: true, status: true },
            });
            if (userAvatar) {
              if (userAvatar.status === "orphaned") {
                throw new UserFacingError(`Avatar ${candidateAvatarId} is orphaned`, {
                  key: "avatarOrphaned",
                });
              }
              try {
                const stickKey = await acquireById(userAvatar.providerKeyId, "heygen");
                stickyAvatar = { acquired: stickKey, userAvatarId: userAvatar.id };
              } catch (e) {
                logger.warn(
                  { userAvatarId: userAvatar.id, keyId: userAvatar.providerKeyId, err: e },
                  "Video submit: HeyGen avatar key gone, marking orphaned",
                );
                await userAvatarService.markOrphaned(userAvatar.id);
                throw new UserFacingError(`Avatar key gone for ${candidateAvatarId}`, {
                  key: "avatarOrphaned",
                });
              }
            }
          }
        }

        // If voice_id is a local UserVoice.id (modern picker format) resolve
        // it to the current ElevenLabs externalId here so the provider
        // adapter (HeyGen / D-ID) receives a voice_id it can actually use.
        // Records saved before this migration store the externalId directly
        // — both shapes are accepted via the two-pass findFirst below.
        let effectiveModelSettings = modelSettings;
        const requestedVoice = (modelSettings?.voice_id as string | undefined)?.trim();
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
            try {
              const resolved = await resolveVoiceForTTS(userVoice.id);
              effectiveModelSettings = { ...modelSettings, voice_id: resolved.voiceId };
            } catch (err) {
              logger.warn(
                { userVoiceId: userVoice.id, err },
                "Video submit: failed to resolve cloned voice, falling back to raw voice_id",
              );
            }
          }
        }

        let submittedKeyId: string | null = null;
        let effectiveProvider: string = modelMeta?.provider ?? "";

        if (stickyAvatar) {
          // HeyGen avatar — fallback не применяется (avatar bound to a single
          // provider/account). Sticky-acquire + submit как раньше.
          const acquired = await acquireForSubmitSticky({
            acquired: stickyAvatar.acquired,
            modelId,
            job,
            token,
            queue: getVideoQueue(),
          });
          const submitAdapter = createVideoAdapter(modelId, acquired);
          providerJobId = await submitWithThrottle({
            modelId,
            provider: modelMeta?.provider,
            section: "video",
            job,
            token,
            queue: getVideoQueue(),
            keyId: acquired.keyId,
            submit: () =>
              submitAdapter.submit({
                prompt: effectivePrompt,
                imageUrl,
                mediaInputs,
                aspectRatio,
                duration,
                modelSettings: effectiveModelSettings,
                userId: BigInt(userIdStr),
              }),
          });
          submittedKeyId = acquired.keyId;
        } else if (modelMeta && fallbackCandidates.length > 0) {
          // У модели зарегистрированы fallback'и — идём через submitWithFallback.
          const fbResult = await submitWithFallback<string, VideoJobData>({
            primaryModel: modelMeta,
            fallbacks: fallbackCandidates,
            section: "video",
            job,
            token,
            allowFiveXxFallback: job.attemptsMade >= 2,
            jobId: dbJobId,
            userId: userIdStr,
            submit: async (model, acquired) => {
              const adapter = createVideoAdapter(model, acquired);
              return adapter.submit({
                prompt: effectivePrompt,
                imageUrl,
                mediaInputs,
                aspectRatio,
                duration,
                modelSettings: effectiveModelSettings,
                userId: BigInt(userIdStr),
              });
            },
          });
          providerJobId = fbResult.result;
          submittedKeyId = fbResult.acquired.keyId;
          effectiveProvider = fbResult.effectiveProvider;
          await writeFallbackState({
            primaryProvider: modelMeta.provider,
            effectiveProvider,
            attemptedProviders: fbResult.attempts.map((a) => a.provider),
          });
        } else {
          // Нет fallback'ов — обычный путь через submitWithThrottle.
          const acquired = await acquireForSubmit({
            provider: keyProvider,
            modelId,
            job,
            token,
            queue: getVideoQueue(),
          });
          const submitAdapter = createVideoAdapter(modelId, acquired);
          providerJobId = await submitWithThrottle({
            modelId,
            provider: modelMeta?.provider,
            section: "video",
            job,
            token,
            queue: getVideoQueue(),
            keyId: acquired.keyId,
            submit: () =>
              submitAdapter.submit({
                prompt: effectivePrompt,
                imageUrl,
                mediaInputs,
                aspectRatio,
                duration,
                modelSettings: effectiveModelSettings,
                userId: BigInt(userIdStr),
              }),
          });
          submittedKeyId = acquired.keyId;
        }

        logger.info(
          { dbJobId, modelId, providerJobId, effectiveProvider },
          "Submitted video generation task",
        );
        await db.generationJob.update({
          where: { id: dbJobId },
          data: {
            providerJobId,
            providerKeyId: submittedKeyId,
            // Фиксируем момент перехода в poll-стадию: после Redis wipe
            // recovery восстановит таймер с этой точки, а не с нуля.
            pollStartedAt: new Date(),
          },
        });
      }

      logger.info({ dbJobId, providerJobId }, "Video poll scheduled");
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
      return; // unreachable — restores TS narrowing for s3Key/outputUrl/outputId
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      const providerJobId = existingJob?.providerJobId;
      if (!providerJobId) throw new Error(`Video poll stage without providerJobId: ${dbJobId}`);

      // Если на submit-стадии случился fallback — используем его модель/keyProvider.
      const fbStateNow = readFallbackState();
      const effModel =
        (fbStateNow.effectiveProvider && findModelByProvider(fbStateNow.effectiveProvider)) ||
        modelMeta;
      if (!effModel) throw new Error(`Unknown video model: ${modelId}`);
      const effKeyProvider = resolveKeyProviderForModel(effModel);

      const acquired = await acquireForPoll(existingJob?.providerKeyId, effKeyProvider);
      pollAdapter = createVideoAdapter(effModel, acquired);

      videoResult = await pollAdapter.poll(providerJobId);

      if (!videoResult) {
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
        return; // unreachable — restores TS narrowing for videoResult
      }

      // videoResult present → finalize inline.
      const { ext, contentType } = sectionMeta("video");

      let actualDuration: number | null = null;
      let actualWidth: number | null = null;
      let actualHeight: number | null = null;
      let actualFps: number | null = null;
      try {
        const buf = pollAdapter?.fetchBuffer
          ? await pollAdapter.fetchBuffer(videoResult.url)
          : await fetch(videoResult.url).then((r) =>
              r.ok
                ? r.arrayBuffer().then(Buffer.from)
                : Promise.reject(new Error(`HTTP ${r.status}`)),
            );
        videoBuffer = buf;
        const info = parseMp4Info(buf);
        actualDuration = info.duration;
        actualWidth = info.width;
        actualHeight = info.height;
        actualFps = info.fps;
      } catch {
        // non-fatal
      }

      s3Key = videoBuffer
        ? await uploadBuffer(
            buildS3Key("video", userIdStr, dbJobId, ext),
            videoBuffer,
            contentType,
          ).catch(() => null)
        : null;

      let thumbnailS3Key: string | null = null;
      if (videoBuffer && s3Key) {
        const thumbBuf = await generateVideoThumbnail(videoBuffer);
        if (thumbBuf) {
          thumbnailS3Key = await uploadBuffer(
            buildThumbnailKey(s3Key),
            thumbBuf,
            "image/webp",
          ).catch(() => null);
        }
      }

      outputUrl = videoResult.url;

      try {
        const output = await db.generationJobOutput.create({
          data: { jobId: dbJobId, index: 0, outputUrl, s3Key, thumbnailS3Key },
        });
        outputId = output.id;
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Stalled-redelivery race: another runner wrote outputs first. Bail.
          logger.info(
            { dbJobId },
            "Video finalize: duplicate output detected — another runner is finalizing",
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
        logger.info({ dbJobId }, "Video finalize: job already done by another runner");
        return;
      }

      const model = AI_MODELS[modelId];
      if (model) {
        // Providers that bill per whole second — round up so we never under-charge.
        const CEIL_DURATION_MODELS = new Set(["heygen"]);
        const rawDuration = actualDuration ?? duration ?? 5;
        let effectiveDuration = CEIL_DURATION_MODELS.has(modelId)
          ? Math.ceil(rawDuration)
          : rawDuration;

        // Wan 2.7 reference-to-video (first_clip): billable = min(inputDur, 5) + outputDur.
        if (modelId === "wan") {
          const firstClipUrl = (mediaInputs as Record<string, string[]> | undefined)
            ?.first_clip?.[0];
          if (firstClipUrl) {
            const inputSeconds = await fetchClipDurationSec(firstClipUrl).catch(() => 5);
            effectiveDuration += Math.min(inputSeconds, 5);
          }
        }
        const videoTokens = model.costUsdPerMVideoToken
          ? computeVideoTokens(
              model,
              aspectRatio,
              effectiveDuration,
              actualWidth ?? undefined,
              actualHeight ?? undefined,
              actualFps ?? undefined,
            )
          : undefined;
        const refVideos = (mediaInputs as Record<string, string[]> | undefined)?.ref_videos ?? [];
        const hasVideoInputs = refVideos.length > 0;
        const internalCost = calculateCost(
          model,
          0,
          0,
          undefined,
          videoTokens,
          modelSettings,
          effectiveDuration,
          undefined,
          { hasVideoInputs },
        );
        deductResult = await deductTokens(BigInt(userIdStr), internalCost, modelId);
        await db.generationJob.update({
          where: { id: dbJobId },
          data: { tokensSpent: internalCost },
        });
      }
    }

    // ── Stage 3: send to user ────────────────────────────────────────────
    const rawVideoBuf = await resolveTelegramVideoBuffer(s3Key, outputUrl, videoBuffer);

    // Remux to faststart (moov at front) so Telegram's head-only probe returns
    // correct width/height/duration for the inline preview. Stream-copy only,
    // no re-encoding — typical cost ~50-150 ms per clip.
    const videoBuf = await remuxToFaststart(rawVideoBuf);

    const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
    const tooLargeForTelegram = videoBuf.byteLength > VIDEO_MAX_BYTES;

    const actionRow: InlineKeyboardButton[] | null = tooLargeForTelegram
      ? s3Key
        ? [buildDownloadButton(t.common.downloadFile, s3Key, userIdStr)]
        : null
      : sendOriginalLabel
        ? [{ text: sendOriginalLabel, callback_data: `orig_${outputId}` }]
        : null;
    const replyMarkup = actionRow ? { inline_keyboard: [actionRow] } : undefined;

    const model = AI_MODELS[modelId];
    const hasAudioDriver =
      !!(modelSettings?.voice_s3key || modelSettings?.voice_url) ||
      !!mediaInputs?.driving_audio?.length ||
      !!mediaInputs?.reference_audios?.length;
    const caption = buildResultCaption(t, model?.name ?? modelId, prompt, {
      cost: deductResult?.deducted,
      subscriptionBalance: deductResult?.subscriptionTokenBalance,
      tokenBalance: deductResult?.tokenBalance,
      emptyPromptLabel: hasAudioDriver ? t.common.generationAudioPrompt : undefined,
    });

    if (tooLargeForTelegram) {
      await telegram.sendMessage(
        telegramChatId,
        `${caption}\n\n${t.errors.fileTooLargeForTelegram}`,
        replyMarkup ? { reply_markup: replyMarkup } : undefined,
      );
    } else {
      // Probe the remuxed buffer so the values we pass to Telegram match the
      // file it will actually receive.
      const info = parseMp4Info(videoBuf);
      const jpegThumb = await generateVideoJpegThumbnail(videoBuf);
      await telegram.sendVideo(telegramChatId, new InputFile(videoBuf, "video.mp4"), {
        caption,
        reply_markup: replyMarkup,
        supports_streaming: true,
        ...(info.width ? { width: info.width } : {}),
        ...(info.height ? { height: info.height } : {}),
        ...(info.duration ? { duration: Math.round(info.duration) } : {}),
        ...(jpegThumb ? { thumbnail: new InputFile(jpegThumb, "thumb.jpg") } : {}),
      });
    }

    logger.info({ dbJobId }, "Video job completed");
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
    // Throws DelayedError if rescheduled (propagates out → BullMQ moves job to delayed).
    // Returns silently otherwise → fall through to user-facing failure handling.
    await deferIfTransientNetworkError({ err, job, token, section: "video" });
    if (isHeyGenProviderUnavailable(err)) {
      const msg = t.errors.modelTemporarilyUnavailable.replace("{modelName}", modelName);
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });
      await notifyTechError(err, {
        jobId: dbJobId,
        modelId,
        section: "video",
        userId: userIdStr,
        attempt: job.attemptsMade,
      });
      await telegram.sendMessage(telegramChatId, msg).catch(() => void 0);
      throw new UnrecoverableError(msg);
    }
    const userMsg = resolveUserFacingMessage(err, t);
    if (userMsg !== null) {
      logger.warn({ dbJobId, err }, "Video job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: userMsg },
      });
      if (shouldNotifyOps(err)) {
        await notifyTechError(err, {
          jobId: dbJobId,
          modelId,
          section: "video",
          userId: userIdStr,
          attempt: job.attemptsMade,
        });
      }
      await telegram.sendMessage(telegramChatId, userMsg).catch(() => void 0);
      throw new UnrecoverableError(userMsg);
    }

    logger.error({ dbJobId, err }, "Video job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      await notifyTechError(err, {
        jobId: dbJobId,
        modelId,
        section: "video",
        userId: userIdStr,
        attempt: job.attemptsMade,
      });

      await telegram
        .sendMessage(telegramChatId, t.errors.generationFailed.replace("{modelName}", modelName))
        .catch(() => void 0);
    }

    throw err;
  }
}

/** Downloads a clip and returns its duration in seconds (0 on failure). */
async function fetchClipDurationSec(url: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch clip: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const info = parseMp4Info(buf);
  return info.duration ?? 0;
}

async function resolveTelegramVideoBuffer(
  s3Key: string | null,
  providerUrl: string,
  cachedBuffer: Buffer | null,
): Promise<Buffer> {
  // Always resolve to a buffer — passing URLs directly to Telegram
  // fails intermittently when Telegram servers can't reach the provider.
  if (cachedBuffer) return cachedBuffer;
  const url = s3Key ? ((await getFileUrl(s3Key).catch(() => null)) ?? providerUrl) : providerUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch video for Telegram: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
