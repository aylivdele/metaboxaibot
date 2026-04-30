/**
 * Killswitch для зависшей generation-job: удаляет job из соответствующей
 * BullMQ-очереди (отменяет все будущие retry'и) + помечает GenerationJob
 * в БД status="failed". Используется когда job застрял в ретраях из-за
 * provider-проблемы и спамит в тех-канал.
 *
 * Запуск:
 *   pnpm -F @metabox/api exec tsx scripts/kill-job.ts <jobId>
 *
 * jobId — это CUID GenerationJob.id (он же BullMQ jobId, мы их синхронизируем
 * для recovery-дедупа).
 */
import "dotenv/config";
import { db } from "../dist/db.js";
import {
  getImageQueue,
  getVideoQueue,
  getAudioQueue,
  getAvatarQueue,
} from "../dist/queues/index.js";
import { getRedis } from "../dist/redis.js";

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: tsx scripts/kill-job.ts <jobId>");
    process.exit(1);
  }

  const dbJob = await db.generationJob.findUnique({
    where: { id: jobId },
    select: { id: true, section: true, status: true, modelId: true },
  });

  if (!dbJob) {
    console.warn(`GenerationJob ${jobId} not found in DB; will still try to remove from queues.`);
  } else {
    console.log(
      `Found DB job: section=${dbJob.section}, status=${dbJob.status}, model=${dbJob.modelId}`,
    );
  }

  const section = dbJob?.section ?? null;
  const queues: {
    name: string;
    queue:
      | ReturnType<typeof getVideoQueue>
      | ReturnType<typeof getImageQueue>
      | ReturnType<typeof getAudioQueue>
      | ReturnType<typeof getAvatarQueue>;
  }[] = [];
  if (!section || section === "video") queues.push({ name: "video", queue: getVideoQueue() });
  if (!section || section === "design") queues.push({ name: "image", queue: getImageQueue() });
  if (!section || section === "audio") queues.push({ name: "audio", queue: getAudioQueue() });
  if (!section || section === "avatar") queues.push({ name: "avatar", queue: getAvatarQueue() });

  for (const { name, queue } of queues) {
    const job = await queue.getJob(jobId);
    if (!job) {
      console.log(`[${name}] job not found`);
      continue;
    }
    const state = await job.getState().catch(() => "unknown");
    console.log(`[${name}] found job in state=${state}, removing...`);
    await job.remove().catch(async (err) => {
      console.warn(`[${name}] remove failed (${err?.message}); trying force-remove via Redis`);
      const redis = getRedis();
      await redis.del(`bull:${name}:${jobId}`, `bull:${name}:${jobId}:lock`);
    });
    console.log(`[${name}] removed`);
  }

  if (dbJob && dbJob.status !== "failed" && dbJob.status !== "completed") {
    await db.generationJob.update({
      where: { id: jobId },
      data: { status: "failed", error: "manually killed via scripts/kill-job.ts" },
    });
    console.log(`DB job marked failed`);
  }

  console.log(`Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
