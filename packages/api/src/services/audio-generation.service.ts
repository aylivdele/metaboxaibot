import { db } from "../db.js";
import { createAudioAdapter, ElevenLabsAdapter } from "../ai/audio/factory.js";
import { getAudioQueue } from "../queues/audio.queue.js";
import { AI_MODELS } from "@metabox/shared";
import { checkBalance, deductTokens, calculateCost } from "./token.service.js";
import { buildS3Key, uploadBuffer, uploadFromUrl } from "./s3.service.js";
import { userStateService } from "./user-state.service.js";
import { translatePromptIfNeeded } from "./prompt-translate.service.js";

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

    const allModelSettings = await userStateService.getModelSettings(userId);
    const modelSettings = allModelSettings[modelId] ?? {};
    const estimatedCost = calculateCost(
      model,
      0,
      0,
      undefined,
      undefined,
      modelSettings,
      undefined,
      prompt.length,
    );
    await checkBalance(userId, estimatedCost);

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

    // If tts-el is using a cloned voice, ensure the EL voice slot still exists
    let resolvedModelSettings = modelSettings;
    if (modelId === "tts-el") {
      const selectedVoiceId = modelSettings.voice_id as string | undefined;
      if (selectedVoiceId) {
        const userVoice = await db.userVoice.findFirst({
          where: { userId, externalId: selectedVoiceId, provider: "elevenlabs" },
          select: { id: true, externalId: true, audioS3Key: true },
        });
        if (userVoice) {
          const freshVoiceId = await ElevenLabsAdapter.ensureVoiceExists(
            userVoice.id,
            userVoice.externalId!,
            userVoice.audioS3Key,
          );
          if (freshVoiceId !== selectedVoiceId) {
            resolvedModelSettings = { ...modelSettings, voice_id: freshVoiceId };
          }
        }
      }
    }

    const adapter = createAudioAdapter(modelId);

    if (!adapter.isAsync && adapter.generate) {
      // ── Sync generation (TTS, ElevenLabs) ───────────────────────────────
      try {
        const effectivePrompt = await translatePromptIfNeeded(
          prompt,
          resolvedModelSettings,
          userId,
        );
        const result = await adapter.generate({
          prompt: effectivePrompt,
          voiceId,
          sourceAudioUrl,
          modelSettings: resolvedModelSettings,
        });

        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "done", outputUrl: result.url ?? null, completedAt: new Date() },
        });

        await deductTokens(
          userId,
          calculateCost(
            model,
            0,
            0,
            undefined,
            undefined,
            resolvedModelSettings,
            undefined,
            prompt.length,
          ),
          modelId,
        );

        // Upload to S3 in background
        const audioKey = buildS3Key("audio", userId.toString(), job.id, result.ext ?? "mp3");
        const uploadFn = result.buffer
          ? uploadBuffer(audioKey, result.buffer, `audio/${result.ext ?? "mpeg"}`)
          : result.url
            ? uploadFromUrl(audioKey, result.url, `audio/${result.ext ?? "mpeg"}`)
            : Promise.resolve(null);
        uploadFn
          .then((s3Key) => {
            if (s3Key) {
              return db.generationJob.update({ where: { id: job.id }, data: { s3Key } });
            }
          })
          .catch(() => void 0);

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
        modelSettings,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
