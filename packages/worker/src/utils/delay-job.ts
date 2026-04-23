import { DelayedError, type Job } from "bullmq";

/**
 * Updates job data, moves the job to delayed state, and throws DelayedError to
 * signal BullMQ that the reschedule was intentional (not a failure or completion).
 *
 * updateData and moveToDelayed are two Redis calls. If moveToDelayed fails after
 * updateData succeeds, the job will retry with updated data — harmless since
 * processors re-read providerJobId/stage from DB on each execution.
 */
export async function delayJob(
  job: Job,
  newData: Record<string, unknown>,
  delayMs: number,
  token?: string,
): Promise<never> {
  await job.updateData(newData);
  await job.moveToDelayed(Date.now() + delayMs, token);
  throw new DelayedError();
}
