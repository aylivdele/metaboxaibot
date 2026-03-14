import type { Job } from "bullmq";
import { Api, InputFile } from "grammy";
import type { AudioJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createAudioAdapter } from "@metabox/api/ai/audio";
import { logger } from "../logger.js";
import { config } from "@metabox/shared";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // 6 minutes max

const telegram = new Api(config.bot.token);

async function sendAudio(
  chatId: number,
  result: { buffer?: Buffer; url?: string; ext: string; contentType: string },
  caption: string,
): Promise<void> {
  if (result.buffer) {
    await telegram.sendAudio(chatId, new InputFile(result.buffer, `audio.${result.ext}`), {
      caption,
    });
  } else if (result.url) {
    await telegram.sendAudio(chatId, result.url, { caption });
  } else {
    throw new Error("Audio result has neither buffer nor URL");
  }
}

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
    let audioResult: { buffer?: Buffer; url?: string; ext: string; contentType: string };

    if (!adapter.isAsync && adapter.generate) {
      // Sync adapter (should not normally end up in queue, but handle gracefully)
      audioResult = await adapter.generate({ prompt, voiceId, sourceAudioUrl });
    } else {
      // Async adapter (Suno)
      if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);
      const providerJobId = await adapter.submit({ prompt, voiceId, sourceAudioUrl });

      let polled = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);
        polled = await adapter.poll!(providerJobId);
        if (polled) break;
      }

      if (!polled) throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
      audioResult = polled;
    }

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "done", outputUrl: audioResult.url ?? null, completedAt: new Date() },
    });

    await sendAudio(telegramChatId, audioResult, `✅ ${modelId}: ${prompt.slice(0, 200)}`);

    logger.info({ dbJobId }, "Audio job completed");
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
