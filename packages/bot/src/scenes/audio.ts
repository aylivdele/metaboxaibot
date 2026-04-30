import { InlineKeyboard } from "grammy";
import type { BotContext } from "../types/context.js";
import { audioGenerationService, userStateService } from "@metabox/api/services";
import { acquireKey, recordSuccess, recordError } from "@metabox/api/services/key-pool";
import { ElevenLabsAdapter } from "@metabox/api/ai/audio";
import { db } from "@metabox/api/db";
import { getRedis } from "@metabox/api/redis";
import { evictOneElevenLabsVoice } from "@metabox/api/services/user-voice";
import {
  AI_MODELS,
  config,
  generateWebToken,
  resolveModelDisplay,
  UserFacingError,
  resolveUserFacingError,
  voiceCloneReturnRedisKey,
} from "@metabox/shared";
import { logger } from "../logger.js";
import { buildCostLine } from "../utils/cost-line.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";
import { transcribeAndReply } from "../utils/voice-transcribe.js";
import { uploadBuffer, buildS3Key } from "@metabox/api/services/s3";
import { acquireLock, releaseLock } from "../utils/dedup.js";
import { activateVideoModel } from "./video.js";

// ── Sub-section entry points ──────────────────────────────────────────────────

/**
 * Called when user presses one of the audio sub-section reply buttons.
 * Sets AUDIO_ACTIVE state with the correct modelId and sends instructions.
 */
export async function handleAudioSubSection(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;

  await userStateService.setState(ctx.user.id, "AUDIO_ACTIVE", "audio");
  await userStateService.setModelForSection(ctx.user.id, "audio", modelId);

  // Voice-clone activated outside the dedicated webapp button → drop any
  // pending HeyGen-return marker, otherwise the user's next clone here would
  // unexpectedly bounce them back to HeyGen.
  if (modelId === "voice-clone") {
    await getRedis()
      .del(voiceCloneReturnRedisKey(ctx.user.id))
      .catch(() => void 0);
  }

  const instructions: Record<string, string> = {
    "tts-openai": ctx.t.audio.ttsActivated,
    "tts-el": ctx.t.audio.ttsElActivated,
    "voice-clone": ctx.t.audio.voiceCloneActivated,
    suno: ctx.t.audio.musicActivated,
    "music-el": ctx.t.audio.musicElActivated,
    "sounds-el": ctx.t.audio.soundsActivated,
  };

  const hint = instructions[modelId] ?? ctx.t.audio.activated;

  // For generative models (not voice-clone), show full structured message + management button
  if (modelId !== "voice-clone") {
    const model = AI_MODELS[modelId];
    if (model) {
      const allSettings = await userStateService.getModelSettings(ctx.user.id);
      const modelSettings = allSettings[modelId] ?? {};
      const costLine = buildCostLine(model, modelSettings, ctx.t);
      const webappUrl = config.bot.webappUrl;
      const token = webappUrl ? generateWebToken(ctx.user.id, config.bot.token) : "";
      const kb = webappUrl
        ? new InlineKeyboard().webApp(
            ctx.t.audio.management,
            `${webappUrl}?page=management&section=audio&wtoken=${token}`,
          )
        : undefined;
      const { name: modelName, description: modelDesc } = resolveModelDisplay(
        modelId,
        ctx.user.language,
        model,
      );
      const voiceInputHint = modelId === "tts-el" ? "" : `\n${ctx.t.voice.inputHint}`;
      await ctx.reply(`${modelName}\n\n${modelDesc}\n\n${hint}${voiceInputHint}\n\n${costLine}`, {
        reply_markup: kb,
        parse_mode: modelId === "tts-el" ? "HTML" : undefined,
      });
      return;
    }
  }

  // voice-clone: no voice transcription hint (audio is used for cloning, not prompts)
  await ctx.reply(`${ctx.t.audio.voiceClone}\n\n${hint}`);
}

// ── Voice cloning: accepts audio/voice file, creates EL voice ────────────────

export async function handleVoiceCloneUpload(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const file = ctx.message?.voice ?? ctx.message?.audio;
  if (!file) return;

  const lockKey = `dedup:voice:${ctx.user.id}:${file.file_id}`;
  try {
    if (!(await acquireLock(lockKey, 120))) return;
  } catch {
    // Redis unavailable — proceed without dedup rather than blocking the user
  }

  const pendingMsg = await ctx.reply(ctx.t.audio.voiceCloneProcessing);

  try {
    // 1. Download audio file from Telegram
    const fileInfo = await ctx.api.getFile(file.file_id);
    const filePath = fileInfo.file_path;
    if (!filePath) throw new Error("No file_path in Telegram response");

    const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${filePath}`;
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const filename = filePath.split("/").pop() ?? "voice.ogg";

    // 2. Generate sequential name
    const count = await db.userVoice.count({
      where: { userId: ctx.user.id, provider: "elevenlabs" },
    });
    const name = `Голос ${ctx.user.id} #${count + 1}`;

    // 3. Clone voice on ElevenLabs (with LRU eviction on limit error).
    // Voice_id живёт на конкретном аккаунте → сохраняем providerKeyId,
    // чтобы при TTS дёргать тот же ключ. Если ключ удалят — voice пересоздастся
    // через resolveVoiceForTTS (см. user-voice.service.ts).
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const cloneSettings = allSettings["voice-clone"] ?? {};
    const removeBackgroundNoise = Boolean(cloneSettings.remove_background_noise ?? false);

    const acquired = await acquireKey("elevenlabs");
    let voiceId: string;
    try {
      try {
        voiceId = await ElevenLabsAdapter.cloneVoice(
          audioBuffer,
          filename,
          name,
          removeBackgroundNoise,
          acquired.apiKey,
        );
      } catch (err) {
        // ElevenLabs returns 400 with voice_limit_reached when the workspace slot limit is exceeded.
        // Эвиктим на ТОМ ЖЕ ключе — слот-лимит per-account.
        if (err instanceof Error && err.message.includes("voice_limit_reached")) {
          const freed = await evictOneElevenLabsVoice(acquired.apiKey, acquired.keyId);
          if (!freed) throw err;
          voiceId = await ElevenLabsAdapter.cloneVoice(
            audioBuffer,
            filename,
            name,
            removeBackgroundNoise,
            acquired.apiKey,
          );
        } else {
          throw err;
        }
      }
      if (acquired.keyId) void recordSuccess(acquired.keyId);
    } catch (err) {
      if (acquired.keyId) {
        void recordError(acquired.keyId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }

    // 4. Upload original audio to S3 for future voice recreation
    const ext = filename.split(".").pop() ?? "ogg";
    const audioS3Key = buildS3Key("voices", ctx.user.id.toString(), voiceId, ext);
    await uploadBuffer(audioS3Key, audioBuffer, `audio/${ext}`).catch(() => null);

    // 5. Fetch preview URL from ElevenLabs (используем тот же ключ, на котором голос создан)
    const previewUrl = await ElevenLabsAdapter.getPreviewUrl(voiceId, acquired.apiKey).catch(
      () => null,
    );

    // 6. Save to DB
    await db.userVoice.create({
      data: {
        userId: ctx.user.id,
        provider: "elevenlabs",
        name,
        externalId: voiceId,
        previewUrl,
        audioS3Key,
        status: "ready",
        providerKeyId: acquired.keyId,
      },
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(ctx.t.audio.voiceCloneSuccess.replace("{name}", name));

    // If the clone was launched from the HeyGen voice picker (webapp button),
    // bring the user back to HeyGen as the active video model so they can
    // immediately use the voice they just cloned.
    const redis = getRedis();
    const returnKey = voiceCloneReturnRedisKey(ctx.user.id);
    const returnTarget = await redis.get(returnKey).catch(() => null);
    if (returnTarget) {
      await redis.del(returnKey).catch(() => void 0);
      if (returnTarget === "heygen") {
        await activateVideoModel(ctx, "heygen").catch((reactivateErr) =>
          logger.warn(reactivateErr, "Voice clone return: failed to re-activate HeyGen"),
        );
      }
    }
  } catch (err) {
    await releaseLock(lockKey);
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    logger.error(err, "Voice clone error");
    await ctx.reply(ctx.t.audio.voiceCloneFailed);
    // Drop any pending return marker — we don't want to silently re-activate
    // HeyGen on the next unrelated voice the user sends.
    await getRedis()
      .del(voiceCloneReturnRedisKey(ctx.user.id))
      .catch(() => void 0);
  }
}

// ── Incoming prompt in AUDIO_ACTIVE state ─────────────────────────────────────

/**
 * Executes a text prompt in the active audio session.
 * Used by handleAudioMessage (text) and the voice-prompt callback.
 */
export async function executeAudioPrompt(ctx: BotContext, prompt: string): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.audioModelId ?? "tts-openai";

  const pendingMsg = await ctx.reply(ctx.t.audio.processing);

  try {
    await audioGenerationService.submitAudio({
      userId: ctx.user.id,
      modelId,
      prompt,
      telegramChatId: chatId,
    });
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else if (err instanceof UserFacingError) {
      await ctx.reply(resolveUserFacingError(err, ctx.t.errors));
    } else {
      logger.error(err, "Audio message error");
      await ctx.reply(ctx.t.audio.generationFailed);
    }
  }
}

export async function handleAudioMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  await executeAudioPrompt(ctx, ctx.message.text);
}

export async function handleAudioVoice(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await transcribeAndReply(ctx, "audio");
}
