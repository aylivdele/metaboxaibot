/**
 * Wraps a provider `submit()` call with a per-model throttle gate.
 *
 * Why this exists: our staged BullMQ pattern (submit → exit → poll → exit → poll …)
 * means worker concurrency slots aren't held across long-running provider
 * generations. So a naive `concurrency: 2` on the BullMQ Worker can still drive
 * a provider's parallel-job ceiling into the ground. This helper introduces a
 * Redis-backed cooldown gate keyed per `modelId` so that:
 *
 *  1. Before submitting, we check the gate. If active, we re-enqueue the same
 *     job with a delay equal to the remaining cooldown (+ jitter) and abort
 *     processing this attempt by throwing a `RateLimitDeferredError`. The
 *     processor's outer catch recognises this sentinel and exits cleanly
 *     without marking the DB job failed or sending a tech alert.
 *
 *  2. If the submit itself throws a rate-limit / concurrency error, the helper
 *     trips the gate, fires a one-time tech-channel notification (the Redis
 *     `SET … NX` makes "first tripper wins" atomic), and then either:
 *
 *      - re-enqueues the job (short-window cooldown), or
 *      - throws `RateLimitLongWindowError` (long-window quota — the processor
 *        maps it to a localised "model temporarily unavailable" reply).
 */

import type { Job, Queue } from "bullmq";
import { checkThrottle, tripThrottle } from "@metabox/api/services/throttle";
import { classifyRateLimit, LONG_WINDOW_THRESHOLD_MS } from "@metabox/api/utils/rate-limit-error";
import { markRateLimited, recordSuccess, recordError } from "@metabox/api/services/key-pool";
import { notifyRateLimit } from "./notify-error.js";
import { logger } from "../logger.js";

export class RateLimitDeferredError extends Error {
  constructor(
    public readonly modelId: string,
    public readonly delayMs: number,
  ) {
    super(`Rate limit deferred for ${modelId} (delay=${delayMs}ms)`);
    this.name = "RateLimitDeferredError";
  }
}

export class RateLimitLongWindowError extends Error {
  constructor(
    public readonly modelId: string,
    public readonly cooldownMs: number,
  ) {
    super(`Long-window rate limit for ${modelId} (cooldown=${cooldownMs}ms)`);
    this.name = "RateLimitLongWindowError";
  }
}

export function isRateLimitDeferredError(err: unknown): err is RateLimitDeferredError {
  return err instanceof RateLimitDeferredError;
}

export function isRateLimitLongWindowError(err: unknown): err is RateLimitLongWindowError {
  return err instanceof RateLimitLongWindowError;
}

interface SubmitWithThrottleOptions<T, D> {
  modelId: string;
  /** Provider key for cooldown lookup (e.g. "fal", "runway"). Falls back to default if unknown. */
  provider?: string;
  /** Section label used in tech notifications ("video" | "image" | …). */
  section: string;
  /** The current BullMQ job — used to re-enqueue with the original payload. */
  job: Job<D>;
  /**
   * The queue to re-enqueue into. Typed loosely (any-data) so callers can pass
   * concrete `Queue<VideoJobData>` etc. without TS getting confused by BullMQ's
   * generic NameType extraction.
   */
  queue: Queue;
  /** Job name to use when re-enqueueing (defaults to "generate"). */
  jobName?: string;
  /**
   * ID ключа из ProviderKey-пула. Если задан — при 429 throttle ставится
   * на ключ (не на модель), чтобы остальные ключи провайдера продолжали работу.
   * null/undefined → трипается model-gate (env-fallback режим).
   */
  keyId?: string | null;
  /** The actual provider submit call. */
  submit: () => Promise<T>;
}

const MIN_DEFER_MS = 1_000;
const JITTER_MS = 2_000;

function withJitter(ms: number): number {
  return Math.max(MIN_DEFER_MS, ms + Math.floor(Math.random() * JITTER_MS));
}

export async function submitWithThrottle<T, D extends object>(
  opts: SubmitWithThrottleOptions<T, D>,
): Promise<T> {
  const { modelId, provider, section, job, queue, submit, keyId } = opts;
  const jobName = opts.jobName ?? "generate";

  // 1. Pre-check the model-level gate (legacy; protects env-fallback case).
  // Per-key gate is pre-checked inside KeyPool.acquireKey before we get here.
  if (!keyId) {
    const status = await checkThrottle(modelId);
    if (status) {
      const delay = withJitter(status.remainingMs);
      logger.info(
        { modelId, delay, reason: status.reason },
        "submitWithThrottle: gate active, deferring job",
      );
      await queue.add(jobName, job.data, {
        delay,
        attempts: 1,
        removeOnComplete: true,
      });
      throw new RateLimitDeferredError(modelId, delay);
    }
  }

  // 2. Try the submit.
  try {
    const result = await submit();
    if (keyId) void recordSuccess(keyId);
    return result;
  } catch (err) {
    const cls = classifyRateLimit(err, provider);
    if (!cls.isRateLimit) {
      if (keyId) {
        void recordError(keyId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }

    // Per-key trip when KeyPool supplied a keyId — isolates bad key, other keys keep flowing.
    // Per-model trip as fallback for env-only case.
    let tripped: boolean;
    if (keyId) {
      await markRateLimited(keyId, cls.cooldownMs, cls.reason);
      tripped = true;
    } else {
      tripped = await tripThrottle(modelId, cls.cooldownMs, cls.reason);
    }

    if (tripped) {
      await notifyRateLimit({
        section,
        modelId,
        cooldownMs: cls.cooldownMs,
        reason: cls.reason,
        isLongWindow: cls.isLongWindow,
      });
    }

    if (cls.isLongWindow || cls.cooldownMs > LONG_WINDOW_THRESHOLD_MS) {
      logger.warn(
        { modelId, keyId, cooldownMs: cls.cooldownMs, reason: cls.reason },
        "submitWithThrottle: long-window quota — failing job",
      );
      throw new RateLimitLongWindowError(modelId, cls.cooldownMs);
    }

    const delay = withJitter(cls.cooldownMs);
    logger.info(
      { modelId, keyId, delay, reason: cls.reason },
      "submitWithThrottle: rate-limited, deferring job",
    );
    await queue.add(jobName, job.data, {
      delay,
      attempts: 1,
      removeOnComplete: true,
    });
    throw new RateLimitDeferredError(modelId, delay);
  }
}
