import type { Job } from "bullmq";
import { Api } from "grammy";
import type { AudioJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createAudioAdapter } from "@metabox/api/ai/audio";
import { uploadBuffer, uploadFromUrl } from "@metabox/api/storage";
import { logger } from "../logger.js";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // 6 minutes max

const telegram = new Api(process.env.BOT_TOKEN!);

export async function processAudioJob(job: Job<AudioJobData>): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    voiceId,
    sourceAudioUrl,
    telegramChatId,
  } = job.data;

  logger.info({ dbJobId, modelId }, "Processing audio job");

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createAudioAdapter(modelId);

  try {
    let s3Url: string;

    if (!adapter.isAsync && adapter.generate) {
      // Sync adapter (should not normally end up in queue, but handle gracefully)
      const result = await adapter.generate({ prompt, voiceId, sourceAudioUrl });
      if (result.buffer) {
        s3Url = await uploadBuffer(result.buffer, "audio", result.ext, result.contentType);
      } else if (result.url) {
        s3Url = await uploadFromUrl(result.url, "audio", result.ext);
      } else {
        throw new Error("Audio adapter returned neither buffer nor URL");
      }
    } else {
      // Async adapter (Suno)
      if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);
      const providerJobId = await adapter.submit({ prompt, voiceId, sourceAudioUrl });

      let audioResult = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);
        audioResult = await adapter.poll!(providerJobId);
        if (audioResult) break;
      }

      if (!audioResult) {
        throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
      }

      if (audioResult.buffer) {
        s3Url = await uploadBuffer(
          audioResult.buffer,
          "audio",
          audioResult.ext,
          audioResult.contentType,
        );
      } else if (audioResult.url) {
        s3Url = await uploadFromUrl(audioResult.url, "audio", audioResult.ext);
      } else {
        throw new Error("Audio result has neither buffer nor URL");
      }
    }

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "done", outputUrl: s3Url, completedAt: new Date() },
    });

    await telegram.sendAudio(telegramChatId, s3Url, {
      caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
    });

    logger.info({ dbJobId, s3Url }, "Audio job completed");
  } catch (err) {
    logger.error({ dbJobId, err }, "Audio job failed");

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "failed", error: String(err) },
    });

    await telegram
      .sendMessage(telegramChatId, `❌ Audio generation failed: ${String(err).slice(0, 200)}`)
      .catch(() => void 0);

    throw err;
  }

  void userIdStr;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
