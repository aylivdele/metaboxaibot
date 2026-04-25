import { DelayedError, type Job } from "bullmq";
import { logger } from "../logger.js";

/**
 * Updates job data, moves the job to delayed state, and throws DelayedError to
 * signal BullMQ that the reschedule was intentional (not a failure or completion).
 *
 * `updateData` and `moveToDelayed` are two separate Redis calls. If
 * `moveToDelayed` throws (lock expired, network blip, Redis hiccup), we still
 * throw `DelayedError` rather than the underlying error. Otherwise the
 * processor's catch-block treats it as a normal failure and may run side
 * effects (token deduction, user-facing "не получилось" message). When
 * `moveToDelayed` fails, the job stays in `active` and BullMQ's stalled-job
 * mechanism will eventually re-deliver it via `lockDuration` / `stalledInterval`.
 */
export async function delayJob(
  job: Job,
  newData: Record<string, unknown>,
  delayMs: number,
  token?: string,
): Promise<never> {
  await job.updateData(newData);
  try {
    await job.moveToDelayed(Date.now() + delayMs, token);
  } catch (err) {
    logger.error(
      { jobId: job.id, err },
      "delayJob: moveToDelayed failed — relying on stalled-job mechanism for re-delivery",
    );
  }
  throw new DelayedError();
}
