import { db } from "@metabox/api/db";
import { deleteFile } from "@metabox/api/services/s3";
import { logger } from "../logger.js";

/** Generation jobs older than this are purged together with their outputs and S3 artifacts. */
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/** Maximum jobs to process in a single tick — keeps memory bounded after a long downtime. */
const BATCH_SIZE = 200;

/**
 * Daily retention sweep: deletes generation jobs older than 60 days along with
 * their outputs and S3 files. Runs in batches so a backlog from a stopped
 * worker doesn't blow up memory. `GenerationJobOutput` rows cascade-delete via
 * the FK; `TokenTransaction` is intentionally untouched (no link to jobs).
 *
 * Idempotent — safe to re-run; only finds jobs still present past the cutoff.
 */
export async function runCleanupOldJobs(): Promise<{ deletedJobs: number; deletedFiles: number }> {
  const cutoff = new Date(Date.now() - RETENTION_MS);

  let totalJobs = 0;
  let totalFiles = 0;

  // Outer loop processes successive batches until nothing matches the cutoff.
  // Each iteration grabs at most BATCH_SIZE jobs to delete; if we got fewer
  // than the batch size we know the backlog is drained and exit.
  for (;;) {
    const batch = await db.generationJob.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        outputs: { select: { s3Key: true, thumbnailS3Key: true } },
      },
    });

    if (batch.length === 0) break;

    const fileResults = await Promise.allSettled(
      batch.flatMap((job) =>
        job.outputs.flatMap((o) => {
          const tasks: Promise<boolean>[] = [];
          if (o.s3Key) tasks.push(deleteFile(o.s3Key));
          if (o.thumbnailS3Key) tasks.push(deleteFile(o.thumbnailS3Key));
          return tasks;
        }),
      ),
    );
    totalFiles += fileResults.filter((r) => r.status === "fulfilled" && r.value === true).length;

    // Cascade FK on GenerationJobOutput.jobId removes rows automatically.
    const del = await db.generationJob.deleteMany({
      where: { id: { in: batch.map((j) => j.id) } },
    });
    totalJobs += del.count;

    if (batch.length < BATCH_SIZE) break;
  }

  if (totalJobs > 0) {
    logger.info(
      { deletedJobs: totalJobs, deletedFiles: totalFiles, cutoff: cutoff.toISOString() },
      "Cleanup: removed expired generation jobs",
    );
  }

  return { deletedJobs: totalJobs, deletedFiles: totalFiles };
}
