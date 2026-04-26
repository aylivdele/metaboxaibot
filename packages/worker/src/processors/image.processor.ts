import { UnrecoverableError, DelayedError } from "bullmq";
import type { Job } from "bullmq";
import { delayJob } from "../utils/delay-job.js";
import { resolveUserFacingMessage, shouldNotifyOps } from "../utils/user-facing-error.js";
import { getIntervalForElapsed } from "../utils/poll-schedule.js";
import { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import type { ImageJobData } from "@metabox/api/queues";
import { getImageQueue } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createImageAdapter } from "@metabox/api/ai/image";
import type { ImageResult } from "@metabox/api/ai/image";
import {
  deductTokens,
  calculateCost,
  usdToTokens,
  translatePromptIfNeeded,
} from "@metabox/api/services";
import {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  getFileUrl,
  generateThumbnail,
  measureImageMegapixels,
  compressForTelegramPhoto,
} from "@metabox/api/services/s3";
import { buildDownloadButton } from "@metabox/api/utils/download-token";
import { isUniqueViolation } from "../utils/prisma-errors.js";
import { InputFile } from "grammy";
import { logger } from "../logger.js";
import { config, AI_MODELS, getT, buildResultCaption } from "@metabox/shared";
import type { DeductResult } from "@metabox/api/services";
import { notifyTechError, notifyRateLimit } from "../utils/notify-error.js";
import { submitWithThrottle, isRateLimitLongWindowError } from "../utils/submit-with-throttle.js";
import { acquireForSubmit, acquireForPoll } from "../utils/acquire-for-processor.js";
import { resolveKeyProvider } from "@metabox/api/ai/key-provider";
import { deferIfTransientNetworkError } from "../utils/defer-transient.js";
import {
  acquireKey,
  markRateLimited,
  recordError,
  recordSuccess,
} from "@metabox/api/services/key-pool";
import { isPoolExhaustedError } from "@metabox/api/utils/pool-exhausted-error";
import { classifyRateLimit, LONG_WINDOW_THRESHOLD_MS } from "@metabox/api/utils/rate-limit-error";
import type { Prisma } from "@prisma/client";

/**
 * Per-sub-job state в `inputData.batch.subJobs[i]` для virtual batch.
 * Сохраняется ПОСЛЕ каждого submit/poll для idempotent restart-recovery.
 *
 * - `pending` — запрос отправлен (`providerJobId` есть для async, или ждём
 *   первого poll-tick), но конечного результата ещё нет.
 * - `succeeded` — есть готовый ImageResult (хранится здесь же `result`,
 *   sync-адаптеры — на случай если worker крашнулся между submit и finalize).
 * - `failed` — терминальная ошибка (429 после eviction-попытки, PoolExhausted,
 *   contentPolicy от провайдера и т.п.). Хранится в `error`.
 */
interface VirtualBatchSubJob {
  status: "pending" | "succeeded" | "failed";
  providerJobId?: string | null;
  providerKeyId?: string | null;
  /** Sync-адаптер: результат, чтобы restart не сабмитил повторно. */
  result?: ImageResult;
  error?: string;
}
interface VirtualBatchState {
  n: number;
  subJobs: VirtualBatchSubJob[];
}

const INITIAL_POLL_INTERVAL_MS = 5000;

/** Telegram multipart upload limit for sendDocument (used by `orig_` callback). */
const TELEGRAM_DOC_MAX_BYTES = 50 * 1024 * 1024;

const telegram = new Api(config.bot.token);

/** Upload an image to S3 and generate a thumbnail. Returns { s3Key, thumbnailS3Key }. */
async function uploadImageToS3(
  url: string,
  userIdStr: string,
  keySuffix: string,
  contentTypeHint?: string,
  filenameHint?: string,
): Promise<{ s3Key: string | null; thumbnailS3Key: string | null; buffer: Buffer | null }> {
  const isSvg = filenameHint?.endsWith(".svg") ?? false;
  const resolvedContentType = isSvg
    ? "image/svg+xml"
    : (contentTypeHint ?? sectionMeta("image").contentType);
  const resolvedExt = isSvg
    ? "svg"
    : (resolvedContentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg");

  let imageBuffer: Buffer | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    logger.error({ reason: e }, "Could not fetch image buffer");
  }

  const key = buildS3Key("image", userIdStr, keySuffix, resolvedExt);
  const s3Key = imageBuffer
    ? await uploadBuffer(key, imageBuffer, resolvedContentType).catch((reason) => {
        logger.error({ reason }, "Could not upload image buffer");
        return null;
      })
    : null;

  let thumbnailS3Key: string | null = null;
  if (imageBuffer && s3Key) {
    const thumbBuf = await generateThumbnail(imageBuffer, resolvedContentType);
    if (thumbBuf) {
      thumbnailS3Key = await uploadBuffer(buildThumbnailKey(s3Key), thumbBuf, "image/webp").catch(
        () => null,
      );
    }
  }

  return { s3Key, thumbnailS3Key, buffer: imageBuffer };
}

export async function processImageJob(job: Job<ImageJobData>, token?: string): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    negativePrompt,
    telegramChatId,
    dialogId,
    aspectRatio,
    modelSettings,
  } = job.data;

  const stage = job.data.stage ?? "generate";

  logger.info({ dbJobId, modelId, stage }, "Processing image job");

  const userLang = (await db.user
    .findUnique({ where: { id: BigInt(userIdStr) }, select: { language: true } })
    .then((u) => u?.language ?? "ru")) as Parameters<typeof getT>[0];
  const t = getT(userLang);
  const modelMeta = AI_MODELS[modelId];
  const modelName = modelMeta?.name ?? modelId;
  const keyProvider = resolveKeyProvider(modelId);

  // ── Virtual batch detection ─────────────────────────────────────────────
  // Если модель — single-only (`nativeBatchMax === 1`) и у неё задан
  // `maxVirtualBatch > 1`, юзер мог попросить N=2..4 картинок. Воркер делает
  // N последовательных submit'ов с разнесением во времени, а в финале склеивает
  // в один mediaGroup. Если все возвращают 1 image — и `n === 1` — это просто
  // обычная single-flow, в которой `isVirtualBatch === false`.
  const requestedN = job.data.numImages ?? 1;
  const nativeBatchMax = modelMeta?.nativeBatchMax ?? 1;
  const isVirtualBatch = requestedN > 1 && nativeBatchMax === 1;
  const SUB_STAGGER_MIN_MS = 12_000;
  const SUB_STAGGER_JITTER_MS = 3_000;

  // Накопленные ошибки sub-job'ов — выводятся юзеру в footer-сообщении
  // после mediaGroup (либо одиночным сообщением при K=0).
  const batchErrors: string[] = [];

  try {
    const existingJob = await db.generationJob.findUnique({
      where: { id: dbJobId },
      select: {
        providerJobId: true,
        providerKeyId: true,
        status: true,
        inputData: true,
        outputs: { orderBy: { index: "asc" as const } },
      },
    });

    /** Прочитать текущее состояние virtual batch из inputData. */
    const readBatchState = (): VirtualBatchState => {
      const raw = (existingJob?.inputData as Record<string, unknown> | null | undefined)?.batch as
        | { n?: number; subJobs?: VirtualBatchSubJob[] }
        | undefined;
      const n = raw?.n ?? requestedN;
      const subJobs = Array.isArray(raw?.subJobs) ? [...raw!.subJobs!] : [];
      while (subJobs.length < n) subJobs.push({ status: "pending" });
      return { n, subJobs };
    };

    /** Записать обновлённое состояние virtual batch в inputData (мерджится с существующим). */
    const writeBatchState = async (state: VirtualBatchState): Promise<void> => {
      const current = await db.generationJob.findUnique({
        where: { id: dbJobId },
        select: { inputData: true },
      });
      const merged = {
        ...((current?.inputData as Record<string, unknown> | null | undefined) ?? {}),
        batch: { n: state.n, subJobs: state.subJobs },
      };
      // Prisma's InputJsonValue is structural; через unknown-cast снимаем type-mismatch
      // (VirtualBatchSubJob[] не наследует index-signature, хотя по содержанию валиден).
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { inputData: merged as unknown as Prisma.InputJsonValue },
      });
      // Также обновляем in-memory snapshot, чтобы readBatchState() сразу видел новое.
      if (existingJob) {
        (existingJob.inputData as unknown) = merged;
      }
    };

    // Output records created during finalization — used for buttons in Stage 3
    let outputRecords: Array<{ id: string; outputUrl: string | null; s3Key: string | null }> = [];
    let deductResult: DeductResult | undefined;

    // Finalizes a set of generated image results: uploads to S3, creates
    // output records, marks the job done and deducts tokens. Shared between
    // the sync-adapter path (Stage 1) and the async-adapter poll path (Stage 2).
    //
    // Returns `true` if THIS run owns the finalization (status transitioned
    // pending/processing → done). Returns `false` if another handler beat us
    // to it (stalled-redelivery race) — caller should skip the user-facing
    // send to avoid duplicate messages.
    //
    // Для virtual batch: `chargeMultiplier` = K (count успешных sub-job'ов).
    // Списываем `perImageCost × K`, не `perImageCost × 1`. По умолчанию 1 — для
    // single-output и для native-batch, где базовый расчёт уже корректен.
    const finalizeResults = async (
      imageResults: ImageResult[],
      options: { chargeMultiplier?: number } = {},
    ): Promise<boolean> => {
      const chargeMultiplier = options.chargeMultiplier ?? 1;
      for (let i = 0; i < imageResults.length; i++) {
        const ir = imageResults[i];
        const keySuffix = imageResults.length > 1 ? `${dbJobId}_${i + 1}` : dbJobId;
        let s3Key: string | null;
        let thumbnailS3Key: string | null;

        if (ir.base64Data) {
          // gpt-image returns raw base64 — decode and upload directly.
          const ext = ir.filename?.split(".").pop() ?? "png";
          const contentType =
            ir.contentType ??
            (ext === "webp" ? "image/webp" : ext === "jpg" ? "image/jpeg" : "image/png");
          const key = buildS3Key("image", userIdStr, keySuffix, ext);
          const buffer = Buffer.from(ir.base64Data, "base64");
          s3Key = await uploadBuffer(key, buffer, contentType).catch(() => null);
          thumbnailS3Key = null;
          if (s3Key) {
            const thumbBuf = await generateThumbnail(buffer, contentType);
            if (thumbBuf) {
              thumbnailS3Key = await uploadBuffer(
                buildThumbnailKey(s3Key),
                thumbBuf,
                "image/webp",
              ).catch(() => null);
            }
          }
        } else {
          const up = await uploadImageToS3(
            ir.url,
            userIdStr,
            keySuffix,
            ir.contentType,
            ir.filename,
          );
          s3Key = up.s3Key;
          thumbnailS3Key = up.thumbnailS3Key;
        }

        try {
          const output = await db.generationJobOutput.create({
            data: { jobId: dbJobId, index: i, outputUrl: ir.url, s3Key, thumbnailS3Key },
          });
          outputRecords.push({ id: output.id, outputUrl: ir.url, s3Key });
        } catch (err) {
          if (isUniqueViolation(err)) {
            // Stalled-redelivery race: another runner wrote outputs[i] first.
            // They're ahead — bail without atomic update or deduct.
            logger.info(
              { dbJobId, index: i },
              "finalizeResults: duplicate output detected — another runner is finalizing",
            );
            return false;
          }
          throw err;
        }
      }

      // Atomic transition: only one runner wins. After Redis wipe + recovery,
      // a stalled-redelivered handler may race here — the loser sees count=0
      // and bails so we don't double-deduct or duplicate the user-send.
      const updated = await db.generationJob.updateMany({
        where: { id: dbJobId, status: { in: ["pending", "processing"] } },
        data: { status: "done", completedAt: new Date() },
      });
      if (updated.count === 0) {
        logger.info({ dbJobId }, "finalizeResults: job already done by another runner");
        return false;
      }

      // Billing — use first image for megapixel calculation.
      const firstResult = imageResults[0];
      const model = AI_MODELS[modelId];
      if (!model) return true;

      const megapixels =
        model.costUsdPerMPixel && firstResult.width && firstResult.height
          ? (firstResult.width * firstResult.height) / 1_000_000
          : undefined;

      const editUrls: string[] =
        (job.data.mediaInputs as Record<string, string[]> | undefined)?.edit ?? [];
      const legacyUrl = job.data.sourceImageUrl;
      const inputUrls: string[] = editUrls.length > 0 ? editUrls : legacyUrl ? [legacyUrl] : [];
      const hasInputImage = inputUrls.length > 0;
      let inputImagesMegapixels: number[] | undefined;
      if (hasInputImage && model.costUsdPerMPixelInput && !model.costUsdPerMPixelInputFixed) {
        inputImagesMegapixels = (
          await Promise.all(inputUrls.map((u) => measureImageMegapixels(u).catch(() => 0)))
        ).filter((mp) => mp > 0);
      } else if (hasInputImage && model.costUsdPerMPixelInputFixed) {
        inputImagesMegapixels = inputUrls.map(() => 1);
      }

      // Adapter-supplied cost (e.g. gpt-image, which sums text + image input +
      // output tokens from OpenAI usage) wins over the matrix lookup, since
      // the matrix only covers per-image output cost.
      const adapterUsdCost = firstResult.providerUsdCost;
      const perImageInternalCost =
        adapterUsdCost !== undefined
          ? usdToTokens(adapterUsdCost)
          : calculateCost(model, 0, 0, megapixels, undefined, modelSettings, undefined, undefined, {
              hasInputImage,
              inputImagesMegapixels,
            });
      // chargeMultiplier > 1 — virtual batch: было K успешных sub-job'ов,
      // каждый стоил perImageInternalCost. Округление вверх — billing safety.
      const internalCost = Math.ceil(perImageInternalCost * chargeMultiplier);

      deductResult = await deductTokens(BigInt(userIdStr), internalCost, modelId);
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { tokensSpent: internalCost },
      });
      return true;
    };

    if (existingJob?.outputs?.length) {
      // Stage 3 already done — skip submit + poll (crash-recovery fast path).
      // Atomic transition: if status is still pending/processing we won the race
      // (handler crashed mid-finalize, this run delivers the result + closes
      // the row). If count=0 the previous handler already finished — skip the
      // duplicate user-send entirely.
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
      outputRecords = existingJob.outputs;
      // Если это был virtual batch с partial success — подгружаем ошибки из
      // inputData.batch.subJobs, чтобы Stage 3 показал footer.
      if (isVirtualBatch) {
        const state = readBatchState();
        for (const s of state.subJobs) {
          if (s.status === "failed" && s.error) batchErrors.push(s.error);
        }
      }
    } else if (stage === "generate") {
      // ── Stage 1: submit (or sync-generate) ─────────────────────────────
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

      // ── Virtual batch path ──────────────────────────────────────────────
      // Делаем N последовательных submit'ов с разнесением 12-15s между ними.
      // Для sync-адаптеров — collect results inline; для async — записываем
      // providerJobId каждого sub-job в inputData.batch и идём в poll-стадию.
      // Skip-на-failure: 429/PoolExhausted/generic от одного sub-job не обрывают
      // батч, помечают только этот sub-job как failed и продолжаем.
      if (isVirtualBatch) {
        const state = readBatchState();
        // Пробегаем по sub-job'ам в порядке индекса. Уже sub-job с providerJobId
        // или терминальным статусом — restart-recovery, пропускаем.
        for (let i = 0; i < state.n; i++) {
          const sub = state.subJobs[i];
          if (sub.status !== "pending" || sub.providerJobId || sub.result) continue;

          // Stagger между NEW submit'ами (не первый и не следующий за пропущенным).
          // Кладём паузу ПЕРЕД текущим, кроме первого свежего.
          const isFirstFresh = !state.subJobs
            .slice(0, i)
            .some(
              (p) =>
                p.providerJobId !== undefined || p.result !== undefined || p.status === "failed",
            );
          if (!isFirstFresh) {
            await new Promise((r) =>
              setTimeout(r, SUB_STAGGER_MIN_MS + Math.floor(Math.random() * SUB_STAGGER_JITTER_MS)),
            );
          }

          let subAcquired: Awaited<ReturnType<typeof acquireKey>> | null = null;
          try {
            subAcquired = await acquireKey(keyProvider);
          } catch (e) {
            if (isPoolExhaustedError(e)) {
              state.subJobs[i] = {
                status: "failed",
                error: "Pool exhausted: no provider keys available",
              };
              await writeBatchState(state);
              continue;
            }
            throw e;
          }

          const subAdapter = createImageAdapter(modelId, subAcquired);
          try {
            if (!subAdapter.isAsync && subAdapter.generate) {
              const r = await subAdapter.generate({
                prompt: effectivePrompt,
                negativePrompt,
                imageUrl: job.data.sourceImageUrl,
                mediaInputs: job.data.mediaInputs,
                aspectRatio,
                modelSettings,
              });
              const result = Array.isArray(r) ? r[0] : r;
              state.subJobs[i] = {
                status: "succeeded",
                providerKeyId: subAcquired.keyId,
                result,
              };
              if (subAcquired.keyId) void recordSuccess(subAcquired.keyId);
            } else if (subAdapter.submit) {
              const providerJobId = await subAdapter.submit({
                prompt: effectivePrompt,
                negativePrompt,
                imageUrl: job.data.sourceImageUrl,
                mediaInputs: job.data.mediaInputs,
                aspectRatio,
                modelSettings,
              });
              state.subJobs[i] = {
                status: "pending",
                providerJobId,
                providerKeyId: subAcquired.keyId,
              };
              // Submit accepted by provider — counts as success for per-key metrics
              // (то же поведение что в submitWithThrottle для non-VB path).
              if (subAcquired.keyId) void recordSuccess(subAcquired.keyId);
            } else {
              throw new Error(`Adapter ${modelId} has no generate()/submit()`);
            }
          } catch (err) {
            // Per-sub-job error handling: classify as 429 vs generic, record on
            // key, mark sub-job failed. NEVER rethrow — batch must continue.
            const cls = classifyRateLimit(err, keyProvider);
            const message = err instanceof Error ? err.message : String(err);
            if (cls.isRateLimit) {
              if (subAcquired.keyId) {
                void markRateLimited(subAcquired.keyId, cls.cooldownMs, cls.reason);
                void notifyRateLimit({
                  section: "image",
                  modelId,
                  cooldownMs: cls.cooldownMs,
                  reason: cls.reason,
                  isLongWindow: cls.isLongWindow || cls.cooldownMs > LONG_WINDOW_THRESHOLD_MS,
                });
              }
              state.subJobs[i] = {
                status: "failed",
                error: `rate-limit: ${message.slice(0, 200)}`,
              };
            } else {
              if (subAcquired.keyId) void recordError(subAcquired.keyId, message.slice(0, 500));
              state.subJobs[i] = { status: "failed", error: message.slice(0, 200) };
            }
          }
          await writeBatchState(state);
        }

        // Submit-loop done. Decide: finalize if all sync (no pending), else poll.
        const stillPending = state.subJobs.some((s) => s.status === "pending");
        if (!stillPending) {
          // Все sync или все failed. Собираем successes и финализируем.
          const successResults: ImageResult[] = [];
          for (const s of state.subJobs) {
            if (s.status === "succeeded" && s.result) successResults.push(s.result);
            else if (s.status === "failed" && s.error) batchErrors.push(s.error);
          }
          if (successResults.length === 0) {
            // K=0 — все провалились. Помечаем job failed и идём в Stage 3 для
            // отправки error-only сообщения.
            await db.generationJob.update({
              where: { id: dbJobId },
              data: { status: "failed", error: batchErrors.join("; ").slice(0, 1000) },
            });
            // outputRecords остаётся пустым; Stage 3 обработает K=0 по footer-ветке.
          } else {
            if (
              !(await finalizeResults(successResults, { chargeMultiplier: successResults.length }))
            )
              return;
          }
        } else {
          // Есть async sub-job'ы → schedule poll.
          logger.info(
            {
              dbJobId,
              n: state.n,
              pending: state.subJobs.filter((s) => s.status === "pending").length,
            },
            "Virtual batch poll scheduled",
          );
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
          return;
        }
        // Fall-through to Stage 3 (sync VB или K=0).
      } else {
        // ── Single-shot path (не virtual batch) ─────────────────────────────
        const acquired = await acquireForSubmit({
          provider: keyProvider,
          modelId,
          job,
          token,
          queue: getImageQueue(),
        });
        const adapter = createImageAdapter(modelId, acquired);

        if (!adapter.isAsync && adapter.generate) {
          // Sync adapter (DALL-E, gpt-image, recraft) — generate inline, then finalize.
          const genResult = await submitWithThrottle({
            modelId,
            provider: modelMeta?.provider,
            section: "image",
            job,
            token,
            queue: getImageQueue(),
            keyId: acquired.keyId,
            submit: () =>
              adapter.generate!({
                prompt: effectivePrompt,
                negativePrompt,
                imageUrl: job.data.sourceImageUrl,
                mediaInputs: job.data.mediaInputs,
                aspectRatio,
                modelSettings,
              }),
          });
          const imageResults: ImageResult[] = Array.isArray(genResult) ? genResult : [genResult];
          if (!(await finalizeResults(imageResults))) return;
        } else {
          // Async adapter — submit then schedule poll.
          if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);

          let providerJobId: string;
          if (existingJob?.providerJobId) {
            providerJobId = existingJob.providerJobId;
            logger.info({ dbJobId, providerJobId }, "Resuming poll for existing provider job");
          } else {
            providerJobId = await submitWithThrottle({
              modelId,
              provider: modelMeta?.provider,
              section: "image",
              job,
              token,
              queue: getImageQueue(),
              keyId: acquired.keyId,
              submit: () =>
                adapter.submit!({
                  prompt: effectivePrompt,
                  negativePrompt,
                  imageUrl: job.data.sourceImageUrl,
                  mediaInputs: job.data.mediaInputs,
                  aspectRatio,
                  modelSettings,
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

          logger.info({ dbJobId, providerJobId }, "Image poll scheduled");
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
      } // close `} else {` of single-shot path (virtual-batch branch above)
    } else {
      // ── Stage 2: poll ──────────────────────────────────────────────────
      if (isVirtualBatch) {
        // Параллельный poll всех pending sub-job'ов одной волной. Each sub-job
        // имеет собственный sticky `providerKeyId`, поэтому acquireForPoll даёт
        // тот же ключ что и при submit. Failure одного sub-job (включая timeout
        // или provider error) помечает только его, не валит весь батч.
        const state = readBatchState();
        const pendingIndices = state.subJobs
          .map((s, i) => (s.status === "pending" && s.providerJobId ? i : -1))
          .filter((i) => i >= 0);

        await Promise.all(
          pendingIndices.map(async (i) => {
            const sub = state.subJobs[i];
            try {
              const subAcquired = await acquireForPoll(sub.providerKeyId ?? null, keyProvider);
              const subAdapter = createImageAdapter(modelId, subAcquired);
              if (!subAdapter.poll) {
                state.subJobs[i] = {
                  ...sub,
                  status: "failed",
                  error: `Adapter ${modelId} has no poll()`,
                };
                return;
              }
              const r = await subAdapter.poll(sub.providerJobId!);
              if (r === null) return; // ещё pending, оставляем как есть
              const result = Array.isArray(r) ? r[0] : r;
              state.subJobs[i] = { ...sub, status: "succeeded", result };
              if (sub.providerKeyId) void recordSuccess(sub.providerKeyId);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (sub.providerKeyId) void recordError(sub.providerKeyId, message.slice(0, 500));
              state.subJobs[i] = { ...sub, status: "failed", error: message.slice(0, 200) };
            }
          }),
        );
        await writeBatchState(state);

        // Settled? — finalize. Иначе — schedule next poll-tick.
        const stillPending = state.subJobs.some((s) => s.status === "pending");
        if (stillPending) {
          const elapsed = Date.now() - (job.data.pollStartedAt ?? Date.now());
          const interval = getIntervalForElapsed(elapsed);
          if (interval === null) {
            // 24h timeout — fail batch entirely.
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
          await delayJob(
            job,
            { ...job.data, stage: "poll", lastIntervalMs: interval },
            interval,
            token,
          );
          return;
        }

        // All settled — собираем successes + errors.
        const successResults: ImageResult[] = [];
        for (const s of state.subJobs) {
          if (s.status === "succeeded" && s.result) successResults.push(s.result);
          else if (s.status === "failed" && s.error) batchErrors.push(s.error);
        }
        if (successResults.length === 0) {
          await db.generationJob.update({
            where: { id: dbJobId },
            data: { status: "failed", error: batchErrors.join("; ").slice(0, 1000) },
          });
        } else {
          if (!(await finalizeResults(successResults, { chargeMultiplier: successResults.length })))
            return;
        }
        // Fall-through to Stage 3 (footer + send).
      } else {
        // ── Single-shot poll path (не virtual batch) ────────────────────────
        const providerJobId = existingJob?.providerJobId;
        if (!providerJobId) throw new Error(`Image poll stage without providerJobId: ${dbJobId}`);

        const acquired = await acquireForPoll(existingJob?.providerKeyId, keyProvider);
        const adapter = createImageAdapter(modelId, acquired);
        if (!adapter.poll) throw new Error(`Adapter ${modelId} has no poll()`);

        const pollResult = await adapter.poll(providerJobId);

        if (!pollResult) {
          // Not done yet — schedule the next poll with tiered interval.
          const elapsed = Date.now() - (job.data.pollStartedAt ?? Date.now());
          const interval = getIntervalForElapsed(elapsed);

          if (interval === null) {
            // 24 h hard cap — cancel and notify.
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
          return; // unreachable — restores TS narrowing for pollResult
        }

        const imageResults: ImageResult[] = Array.isArray(pollResult) ? pollResult : [pollResult];
        if (!(await finalizeResults(imageResults))) return;
      }
    }

    // ── Stage 3: send to user ────────────────────────────────────────────
    const modelForCaption = AI_MODELS[modelId];
    const displayName = modelForCaption?.name ?? modelId;
    const buildCaption = (): string =>
      buildResultCaption(t, displayName, prompt, {
        cost: deductResult?.deducted,
        subscriptionBalance: deductResult?.subscriptionTokenBalance,
        tokenBalance: deductResult?.tokenBalance,
      });

    // K=0 для virtual batch — все sub-job'ы failed, mediaGroup нет, шлём
    // только error-сообщение со списком причин и выходим.
    if (outputRecords.length === 0 && batchErrors.length > 0) {
      const text = t.design.batchAllFailed
        .replace("{total}", String(requestedN))
        .replace("{errors}", batchErrors.join("\n• "));
      await telegram.sendMessage(telegramChatId, "• " + text).catch(() => void 0);
      logger.info({ dbJobId, errors: batchErrors.length }, "Virtual batch all failed");
      return;
    }

    // Batch: multiple outputs → send as media group
    if (outputRecords.length > 1) {
      const mediaGroup: Array<{
        type: "photo";
        media: string | InstanceType<typeof InputFile>;
        caption?: string;
      }> = [];

      const batchCaption = buildCaption();
      const byteSizes: number[] = [];
      for (let i = 0; i < outputRecords.length; i++) {
        const rec = outputRecords[i];
        const filename = `image-${i + 1}.png`;
        const info = await resolveTelegramSource(rec.s3Key, rec.outputUrl ?? "");
        byteSizes.push(info.byteSize);
        const { source } = await prepareTelegramPhoto(info, rec.outputUrl ?? "", filename);
        mediaGroup.push({
          type: "photo",
          media: source,
          ...(i === 0 ? { caption: batchCaption } : {}),
        });
      }

      await telegram.sendMediaGroup(telegramChatId, mediaGroup);

      // Send a single message with refine + (orig|download) buttons for all outputs.
      // Per output: "{N}. 🔄" paired with "{N}. 📎" (≤50 MB) or "{N}. ⬇️" (>50 MB).
      {
        const buttons: InlineKeyboardButton[] = [];
        for (let i = 0; i < outputRecords.length; i++) {
          const rec = outputRecords[i];
          const n = i + 1;
          buttons.push({ text: `${n}. 🔄`, callback_data: `design_ref_${rec.id}` });
          if (byteSizes[i] <= TELEGRAM_DOC_MAX_BYTES) {
            buttons.push({ text: `${n}. 📎`, callback_data: `orig_${rec.id}` });
          } else if (rec.s3Key) {
            buttons.push(buildDownloadButton(`${n}. ⬇️`, rec.s3Key, userIdStr));
          }
        }
        // Layout: <3 pairs → 1 per row, even → 2 per row, odd → 3 per row
        const rows: InlineKeyboardButton[][] = [];
        const totalPairs = outputRecords.length;
        const pairsPerRow = totalPairs <= 3 ? 1 : totalPairs % 2 === 0 ? 2 : 3;
        const chunkSize = 2 * pairsPerRow;
        for (let i = 0; i < buttons.length; i += chunkSize) {
          rows.push(buttons.slice(i, i + chunkSize));
        }
        // Drop the "⬇️ Скачать" line from the legend when no output produced
        // a download button — happens whenever every photo fits under 50 MB
        // (the common case), so we don't tease a button the user can't see.
        const hasDownloadButton = buttons.some(
          (b) => "url" in b || ("web_app" in b && b.web_app !== undefined),
        );
        const hintText = hasDownloadButton
          ? t.design.batchActions
          : t.design.batchActionsNoDownload;
        await telegram.sendMessage(telegramChatId, hintText, {
          reply_markup: { inline_keyboard: rows },
        });
      }

      // Virtual-batch partial-success footer: K из N сгенерировано, перечисляем ошибки.
      if (batchErrors.length > 0) {
        const text = t.design.batchPartialFooter
          .replace("{success}", String(outputRecords.length))
          .replace("{total}", String(requestedN))
          .replace("{errors}", batchErrors.join("\n• "));
        await telegram
          .sendMessage(telegramChatId, "• " + text)
          .catch((reason) => logger.warn(reason, "Could not send batch partial footer"));
      }

      if (dialogId) {
        await db.message.create({
          data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
        });
        for (const rec of outputRecords) {
          await db.message.create({
            data: {
              dialogId,
              role: "assistant",
              content: "",
              mediaUrl: rec.outputUrl ?? "",
              mediaType: "image",
              tokensUsed: 0,
            },
          });
        }
      }

      logger.info({ dbJobId, batchSize: outputRecords.length }, "Image batch job completed");
      return;
    }

    // Single output path
    const rec = outputRecords[0];
    const outputUrl = rec?.outputUrl ?? "";
    const s3Key = rec?.s3Key ?? null;
    const outputId = rec?.id ?? dbJobId;

    const retryExt = s3Key?.split(".").pop() ?? "png";
    const finalImageResult = {
      url: outputUrl,
      filename: `${dbJobId}.${retryExt}`,
      contentType: `image/${retryExt}`,
    };
    if (dialogId) {
      const existingMsg = await db.message.findFirst({
        where: { dialogId, mediaUrl: outputUrl },
        select: { id: true },
      });
      if (!existingMsg) {
        await db.message.create({
          data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
        });
        await db.message.create({
          data: {
            dialogId,
            role: "assistant",
            content: "",
            mediaUrl: outputUrl,
            mediaType: "image",
            tokensUsed: 0,
          },
        });
      }
    }

    const filename = finalImageResult.filename ?? "image.png";
    const info = await resolveTelegramSource(s3Key, finalImageResult.url);
    const { source: tgImageSource, isSvg } = await prepareTelegramPhoto(
      info,
      finalImageResult.url,
      filename,
    );

    const refineRow: InlineKeyboardButton[] = [
      { text: t.design.refine, callback_data: `design_ref_${outputId}` },
    ];
    const actionRow: InlineKeyboardButton[] | null =
      info.byteSize <= TELEGRAM_DOC_MAX_BYTES
        ? [{ text: t.common.sendOriginal, callback_data: `orig_${outputId}` }]
        : s3Key
          ? [buildDownloadButton(t.common.downloadFile, s3Key, userIdStr)]
          : null;
    const rows = [refineRow, actionRow].filter(Boolean) as InlineKeyboardButton[][];
    const replyMarkup = rows.length ? { inline_keyboard: rows } : undefined;

    const singleCaption = buildCaption();
    if (isSvg) {
      await telegram.sendDocument(telegramChatId, tgImageSource, {
        caption: singleCaption,
        reply_markup: replyMarkup,
      });
    } else {
      await telegram.sendPhoto(telegramChatId, tgImageSource, {
        caption: singleCaption,
        reply_markup: replyMarkup,
      });
    }

    // Virtual-batch partial-success c K=1 (один success + 1..3 failures).
    // К одиночному фото добавляем footer-сообщение с разбором ошибок.
    if (batchErrors.length > 0) {
      const text = t.design.batchPartialFooter
        .replace("{success}", String(outputRecords.length))
        .replace("{total}", String(requestedN))
        .replace("{errors}", batchErrors.join("\n• "));
      await telegram
        .sendMessage(telegramChatId, "• " + text)
        .catch((reason) => logger.warn(reason, "Could not send batch partial footer"));
    }

    logger.info({ dbJobId }, "Image job completed");
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
    // Throws DelayedError if rescheduled (re-thrown by next iteration of catch).
    // Returns silently otherwise → fall through to user-facing failure handling.
    await deferIfTransientNetworkError({ err, job, token, section: "image" });
    const userMsg = resolveUserFacingMessage(err, t);
    if (userMsg !== null) {
      logger.warn({ dbJobId, err }, "Image job rejected: user-facing error");
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: userMsg },
      });
      if (shouldNotifyOps(err)) {
        await notifyTechError(err, {
          jobId: dbJobId,
          modelId,
          section: "image",
          userId: userIdStr,
          attempt: job.attemptsMade,
        });
      }
      await telegram.sendMessage(telegramChatId, userMsg).catch(() => void 0);
      throw new UnrecoverableError(userMsg);
    }

    logger.error({ dbJobId, err }, "Image job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      await notifyTechError(err, {
        jobId: dbJobId,
        modelId,
        section: "image",
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

type TelegramImageInfo =
  | { kind: "url"; url: string; byteSize: number }
  | { kind: "buffer"; buffer: Buffer; byteSize: number };

/**
 * Returns the best source info for sending an image to Telegram:
 * 1. S3 presigned URL if HEAD confirms reachability + size (Telegram can fetch directly).
 * 2. S3 presigned URL downloaded as a buffer (when HEAD fails / lacks content-length,
 *    e.g. some S3-compat stores omit it on presigned responses).
 * 3. Provider URL as a last resort — only when S3 isn't configured or we never
 *    stored the file. Provider URLs from fal / Google (nano banana 2) are often
 *    single-use or short-lived and will 409/410 on re-fetch by this point.
 */
async function resolveTelegramSource(
  s3Key: string | null,
  providerUrl: string,
): Promise<TelegramImageInfo> {
  if (s3Key) {
    const s3Url = await getFileUrl(s3Key).catch(() => null);
    if (s3Url) {
      const head = await fetch(s3Url, { method: "HEAD" }).catch(() => null);
      if (head?.ok) {
        const contentLength = head.headers.get("content-length");
        const byteSize = contentLength ? parseInt(contentLength, 10) : NaN;
        if (!isNaN(byteSize) && byteSize > 0) {
          return { kind: "url", url: s3Url, byteSize };
        }
      }
      // HEAD not usable — GET the S3 copy directly instead of re-fetching
      // the (possibly single-use / expired) provider URL.
      const s3Res = await fetch(s3Url).catch(() => null);
      if (s3Res?.ok) {
        const buffer = Buffer.from(await s3Res.arrayBuffer());
        if (buffer.byteLength > 0) {
          return { kind: "buffer", buffer, byteSize: buffer.byteLength };
        }
      }
    }
  }
  const res = await fetch(providerUrl);
  if (!res.ok) throw new Error(`Failed to fetch image from provider: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { kind: "buffer", buffer, byteSize: buffer.byteLength };
}

/** Telegram photo limits: 5MB for URL-based sendPhoto, 10MB for multipart upload. */
const PHOTO_URL_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_BUFFER_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Prepares a Telegram photo source. If the image exceeds photo size limits
 * (and isn't SVG), it's re-encoded in-memory to a JPEG that fits, so we can
 * still deliver it as a photo instead of a document. The re-encoded bytes
 * are not persisted — original S3 copy stays intact.
 */
async function prepareTelegramPhoto(
  info: TelegramImageInfo,
  providerUrl: string,
  filename: string,
): Promise<{ source: string | InstanceType<typeof InputFile>; isSvg: boolean }> {
  const isSvg = filename.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const src = info.kind === "url" ? info.url : new InputFile(info.buffer, filename);
    return { source: src, isSvg: true };
  }

  if (info.kind === "url" && info.byteSize <= PHOTO_URL_MAX_BYTES) {
    return { source: info.url, isSvg: false };
  }
  if (info.kind === "buffer" && info.byteSize <= PHOTO_BUFFER_MAX_BYTES) {
    return { source: new InputFile(info.buffer, filename), isSvg: false };
  }

  // Too large for sendPhoto — download (if URL) and compress in memory.
  let buffer: Buffer;
  if (info.kind === "buffer") {
    buffer = info.buffer;
  } else {
    const res = await fetch(info.url).catch(() => null);
    if (!res || !res.ok) {
      // Fallback to provider URL if S3 fetch fails.
      const fallback = await fetch(providerUrl);
      if (!fallback.ok) throw new Error(`Failed to fetch image: ${fallback.status}`);
      buffer = Buffer.from(await fallback.arrayBuffer());
    } else {
      buffer = Buffer.from(await res.arrayBuffer());
    }
  }
  const compressed = await compressForTelegramPhoto(buffer);
  const jpegName = filename.replace(/\.[^.]+$/, "") + ".jpg";
  return { source: new InputFile(compressed, jpegName), isSvg: false };
}
