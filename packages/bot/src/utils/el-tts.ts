import {
  userStateService,
  s3Service,
  calculateCost,
  checkBalance,
  deductTokens,
  type SubmitVideoParams,
} from "@metabox/api/services";
import { ElevenLabsAdapter } from "@metabox/api/ai/audio";
import { resolveVoiceForTTS } from "@metabox/api/services/user-voice";
import { db } from "@metabox/api/db";
import { AI_MODELS } from "@metabox/shared";
import { logger } from "../logger.js";

export const AVATAR_MODELS = new Set(["heygen", "d-id"]);

/**
 * If the video model uses an ElevenLabs voice (voice_provider === "elevenlabs",
 * or legacy settings where voice_id maps to a UserVoice/EL externalId) and no
 * raw audio override is present, synthesises the prompt via ElevenLabs TTS,
 * uploads to S3, deducts TTS tokens, and returns the S3 key.
 * Returns null when TTS pre-generation is not needed.
 */
export async function preGenerateELTts(
  userId: bigint,
  modelId: string,
  prompt: string,
  videoModelSettings: Record<string, unknown>,
  rawVoiceOverride: string | undefined,
): Promise<string | null> {
  if (!AVATAR_MODELS.has(modelId)) return null;
  if (rawVoiceOverride) return null; // raw audio takes priority
  if (videoModelSettings.voice_s3key as string | undefined) return null;

  const requestedVoice = videoModelSettings.voice_id as string | undefined;
  const voiceProvider = videoModelSettings.voice_provider as string | undefined;
  if (!requestedVoice) return null;
  // Явно non-EL provider (например "heygen" — native HeyGen voice) → не TTS'им,
  // адаптер передаст voice_id напрямую в HeyGen.
  if (voiceProvider && voiceProvider !== "elevenlabs") return null;

  const userVoice =
    (await db.userVoice.findFirst({
      where: { id: requestedVoice, provider: "elevenlabs" },
      select: { id: true },
    })) ??
    (await db.userVoice.findFirst({
      where: { provider: "elevenlabs", externalId: requestedVoice },
      select: { id: true },
    }));

  if (!userVoice && voiceProvider !== "elevenlabs") return null;

  const ttsModel = AI_MODELS["tts-el"];
  if (!ttsModel) return null;

  let resolvedVoiceId = requestedVoice;
  let stickyApiKey: string | undefined;
  if (userVoice) {
    const resolved = await resolveVoiceForTTS(userVoice.id);
    resolvedVoiceId = resolved.voiceId;
    stickyApiKey = resolved.acquired.apiKey;
  }

  const allSettings = await userStateService.getModelSettings(userId);
  const ttsSettings: Record<string, unknown> = {
    ...(allSettings["tts-el"] ?? {}),
    voice_id: resolvedVoiceId,
  };

  const ttsCost = calculateCost(
    ttsModel,
    0,
    0,
    undefined,
    undefined,
    ttsSettings,
    undefined,
    prompt.length,
  );
  await checkBalance(userId, ttsCost);

  const adapter = new ElevenLabsAdapter("tts-el", stickyApiKey);
  const result = await adapter.generate({ prompt, modelSettings: ttsSettings });
  if (!result.buffer) return null;

  const s3Key = `voice/el/${userId.toString()}/${Date.now()}.mp3`;
  const uploadedKey = await s3Service
    .uploadBuffer(s3Key, result.buffer, "audio/mpeg")
    .catch(() => null);
  if (!uploadedKey) {
    logger.warn(
      { userId, modelId },
      "EL TTS generated but S3 upload failed — falling back to no TTS audio",
    );
    return null;
  }

  await deductTokens(userId, ttsCost, "tts-el");

  return uploadedKey;
}

/**
 * Wraps `preGenerateELTts` for the video submit pipeline. If the model is an
 * avatar model with an EL voice and no audio override yet, generates EL TTS
 * and returns a new SubmitVideoParams with `voice_s3key` injected. Otherwise
 * returns the params unchanged.
 *
 * Used both by the confirm-off path (bot scenes) and the confirm-on path
 * (`handleLowIqStart` → `runReplaySubmit`) so EL TTS only runs after the
 * generation is committed (not at gate-time).
 */
export async function ensureELTtsForVideo(
  submitParams: SubmitVideoParams,
): Promise<SubmitVideoParams> {
  const { userId, modelId, prompt, extraModelSettings } = submitParams;
  if (!AVATAR_MODELS.has(modelId)) return submitParams;
  const existingVoiceS3Key = (extraModelSettings?.voice_s3key as string | undefined)?.trim();
  if (existingVoiceS3Key) return submitParams;

  const allSettings = await userStateService.getModelSettings(userId);
  const fullModelSettings = allSettings[modelId] ?? {};

  const elTtsS3Key = await preGenerateELTts(userId, modelId, prompt, fullModelSettings, undefined);
  if (!elTtsS3Key) return submitParams;

  return {
    ...submitParams,
    extraModelSettings: {
      ...extraModelSettings,
      voice_s3key: elTtsS3Key,
      voice_url: "",
    },
  };
}
