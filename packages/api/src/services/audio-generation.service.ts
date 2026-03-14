import { db } from "../db.js";
import { createAudioAdapter } from "../ai/audio/factory.js";
import { getAudioQueue } from "../queues/audio.queue.js";
import { AI_MODELS } from "@metabox/shared";

export interface SubmitAudioParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  voiceId?: string;
  sourceAudioUrl?: string;
  telegramChatId: number;
}

export interface SubmitAudioResult {
  dbJobId: string;
  /** Populated for sync models (TTS). Use InputFile(audioBuffer) or audioUrl. */
  audioBuffer?: Buffer;
  audioUrl?: string;
  audioExt?: string;
  isPending: boolean;
}

export const audioGenerationService = {
  async submitAudio(params: SubmitAudioParams): Promise<SubmitAudioResult> {
    const { userId, modelId, prompt, voiceId, sourceAudioUrl, telegramChatId } = params;

    const model = AI_MODELS[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: "",
        section: "audio",
        modelId,
        prompt,
        status: "pending",
      },
    });

    const adapter = createAudioAdapter(modelId);

    if (!adapter.isAsync && adapter.generate) {
      // ── Sync generation (TTS, ElevenLabs) ───────────────────────────────
      try {
        const result = await adapter.generate({ prompt, voiceId, sourceAudioUrl });

        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "done", outputUrl: result.url ?? null, completedAt: new Date() },
        });

        return {
          dbJobId: job.id,
          audioBuffer: result.buffer,
          audioUrl: result.url,
          audioExt: result.ext,
          isPending: false,
        };
      } catch (err) {
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "failed", error: String(err) },
        });
        throw err;
      }
    }

    // ── Async generation — enqueue for worker ─────────────────────────────
    const queue = getAudioQueue();
    await queue.add(
      "generate",
      {
        dbJobId: job.id,
        userId: userId.toString(),
        modelId,
        prompt,
        voiceId,
        sourceAudioUrl,
        telegramChatId,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
