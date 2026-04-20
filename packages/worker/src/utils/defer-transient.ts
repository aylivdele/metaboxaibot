/**
 * Soft-retry helper for transient network failures (EAI_AGAIN, ECONNRESET, …).
 *
 * Why this exists: BullMQ `attempts: 1` on poll-stage re-enqueues means a
 * transient DNS/socket hiccup on the poll leg fails the whole job
 * immediately. This gives us an orthogonal retry budget that survives stage
 * transitions by carrying a `transientRetries` counter in the job payload.
 *
 * Use from the processor's outer catch, after rate-limit checks and before
 * user-facing / tech-notification branches:
 *
 *   if (await deferIfTransientNetworkError({ err, job, queue, section })) return;
 */

import type { Job, Queue } from "bullmq";
import { isTransientNetworkError } from "@metabox/api/utils/fetch";
import { logger } from "../logger.js";

const MAX_TRANSIENT_RETRIES = 5;
const BASE_DELAY_MS = 30_000;
const JITTER_MS = 30_000;

interface DeferIfTransientOpts<D extends { transientRetries?: number; stage?: string }> {
  err: unknown;
  job: Job<D>;
  queue: Queue;
  /** Section label (image/video/audio/avatar) — used only for logs. */
  section: string;
  /**
   * BullMQ job name to re-enqueue under. Defaults to `job.data.stage ?? "generate"`.
   * Pass explicitly for queues that don't use the `stage` field (e.g. avatar uses `action`).
   */
  jobName?: string;
}

/**
 * Returns true if the job was re-enqueued (caller should `return` from the
 * catch block). Returns false when the error isn't transient or the retry
 * budget is exhausted — in which case the caller falls through to normal
 * failure handling.
 */
export async function deferIfTransientNetworkError<
  D extends { transientRetries?: number; stage?: string },
>(opts: DeferIfTransientOpts<D>): Promise<boolean> {
  const { err, job, queue, section } = opts;
  if (!isTransientNetworkError(err)) return false;

  const current = job.data.transientRetries ?? 0;
  if (current >= MAX_TRANSIENT_RETRIES) {
    logger.warn(
      { section, jobId: job.id, retries: current },
      "Transient retry budget exhausted — falling through to failure",
    );
    return false;
  }

  const next = current + 1;
  const delay = BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
  const jobName = opts.jobName ?? job.data.stage ?? "generate";

  await queue.add(
    jobName,
    { ...job.data, transientRetries: next },
    { delay, attempts: 1, removeOnComplete: true },
  );

  logger.warn(
    { section, jobId: job.id, delay, attempt: next, err },
    "Transient network error — re-enqueued job",
  );

  return true;
}
