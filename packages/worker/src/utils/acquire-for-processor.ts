/**
 * Обёртка над KeyPool.acquireKey/acquireById для BullMQ-процессоров.
 * Если пул исчерпан — defers SAME job через `moveToDelayed` (jobId сохраняется,
 * recovery-дедуп продолжает работать) и кидает `DelayedError`, чтобы процессор
 * вышел чисто (BullMQ положит job в delayed-set без mark failed).
 */

import type { Job, Queue } from "bullmq";
import { acquireKey, acquireById } from "@metabox/api/services/key-pool";
import type { AcquiredKey } from "@metabox/api/services/key-pool";
import { isPoolExhaustedError } from "@metabox/api/utils/pool-exhausted-error";
import { checkKeyThrottle } from "@metabox/api/services/throttle";
import { delayJob } from "./delay-job.js";
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
  /**
   * BullMQ worker token for the current job. Required for `moveToDelayed`.
   * Forward from the second arg of the processor function.
   */
  token?: string;
  /**
   * Kept in the API for symmetry with other helpers; not used directly anymore
   * (deferral is via `job.moveToDelayed`).
   */
  queue?: Queue;
  jobName?: string;
}

/**
 * Выбрать ключ для submit-стадии. При `PoolExhaustedError` — defers job
 * через `moveToDelayed` и бросает `DelayedError` (процессор поймает и выйдет чисто).
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
      await delayJob(opts.job, opts.job.data as Record<string, unknown>, delay, opts.token);
      throw new Error("unreachable: delayJob did not throw");
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
  /**
   * BullMQ worker token for the current job. Required for `moveToDelayed`.
   * Forward from the second arg of the processor function.
   */
  token?: string;
  queue?: Queue;
  jobName?: string;
}

/**
 * Sticky-key submit. Ключ уже выбран ранее (например, привязан к конкретному
 * voice_id / talking_photo_id и не может быть подменён). Здесь мы только
 * проверяем per-key throttle: если активен — defers job через `moveToDelayed`
 * и кидает `DelayedError`. Иначе возвращаем тот же ключ как есть.
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
      await delayJob(opts.job, opts.job.data as Record<string, unknown>, delay, opts.token);
      throw new Error("unreachable: delayJob did not throw");
    }
  }
  return opts.acquired;
}
