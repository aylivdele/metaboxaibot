/**
 * Обёртка над KeyPool.acquireKey/acquireById для BullMQ-процессоров.
 * Если пул исчерпан — ре-енкьюит job с delay = retryAfterMs и кидает
 * RateLimitDeferredError, чтобы процессор вышел чисто (не помечал job failed).
 */

import type { Job, Queue } from "bullmq";
import { acquireKey, acquireById } from "@metabox/api/services/key-pool";
import type { AcquiredKey } from "@metabox/api/services/key-pool";
import { isPoolExhaustedError } from "@metabox/api/utils/pool-exhausted-error";
import { checkKeyThrottle } from "@metabox/api/services/throttle";
import { RateLimitDeferredError } from "./submit-with-throttle.js";
import { logger } from "../logger.js";

const MIN_DEFER_MS = 1_000;
const JITTER_MS = 2_000;

function withJitter(ms: number): number {
  return Math.max(MIN_DEFER_MS, ms + Math.floor(Math.random() * JITTER_MS));
}

interface AcquireOpts<D> {
  provider: string;
  modelId: string;
  job: Job<D>;
  queue: Queue;
  jobName?: string;
}

/**
 * Выбрать ключ для submit-стадии. При `PoolExhaustedError` — ре-енкьюит job
 * и бросает `RateLimitDeferredError` (процессор поймает и выйдет чисто).
 */
export async function acquireForSubmit<D extends object>(
  opts: AcquireOpts<D>,
): Promise<AcquiredKey> {
  try {
    return await acquireKey(opts.provider);
  } catch (err) {
    if (isPoolExhaustedError(err)) {
      const delay = withJitter(err.retryAfterMs);
      logger.info(
        { provider: opts.provider, modelId: opts.modelId, delay },
        "acquireForSubmit: pool exhausted, deferring job",
      );
      await opts.queue.add(opts.jobName ?? "generate", opts.job.data, {
        delay,
        attempts: 1,
        removeOnComplete: true,
      });
      throw new RateLimitDeferredError(opts.modelId, delay);
    }
    throw err;
  }
}

/**
 * Выбрать ключ для poll-стадии по ранее сохранённому keyId.
 * Throttle на этом уровне не проверяется — мы обязаны дополлить job тем же ключом.
 */
export async function acquireForPoll(
  keyId: string | null | undefined,
  provider: string,
): Promise<AcquiredKey> {
  return acquireById(keyId, provider);
}

interface StickyOpts<D> {
  acquired: AcquiredKey;
  modelId: string;
  job: Job<D>;
  queue: Queue;
  jobName?: string;
}

/**
 * Sticky-key submit. Ключ уже выбран ранее (например, привязан к конкретному
 * voice_id / talking_photo_id и не может быть подменён). Здесь мы только
 * проверяем per-key throttle: если активен — ре-енкьюим job и кидаем
 * RateLimitDeferredError. Иначе возвращаем тот же ключ как есть.
 *
 * Для null-keyId (env-fallback) проверка пропускается — env-ключи throttling
 * не отслеживают (нет id).
 */
export async function acquireForSubmitSticky<D extends object>(
  opts: StickyOpts<D>,
): Promise<AcquiredKey> {
  if (opts.acquired.keyId) {
    const t = await checkKeyThrottle(opts.acquired.keyId);
    if (t) {
      const delay = withJitter(t.remainingMs);
      logger.info(
        { keyId: opts.acquired.keyId, modelId: opts.modelId, delay, reason: t.reason },
        "acquireForSubmitSticky: key throttled, deferring job",
      );
      await opts.queue.add(opts.jobName ?? "generate", opts.job.data, {
        delay,
        attempts: 1,
        removeOnComplete: true,
      });
      throw new RateLimitDeferredError(opts.modelId, delay);
    }
  }
  return opts.acquired;
}
