import { InputFile, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/context.js";
import { audioGenerationService, userStateService } from "@metabox/api/services";
import { ElevenLabsAdapter } from "@metabox/api/ai/audio";
import { db } from "@metabox/api/db";
import { AI_MODELS, config, generateWebToken } from "@metabox/shared";
import { logger } from "../logger.js";
import { buildCostLine } from "../utils/cost-line.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";
import { uploadBuffer, buildS3Key } from "@metabox/api/services/s3";

// ── Sub-section entry points ──────────────────────────────────────────────────

/**
 * Called when user presses one of the audio sub-section reply buttons.
 * Sets AUDIO_ACTIVE state with the correct modelId and sends instructions.
 */
export async function handleAudioSubSection(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;

  await userStateService.setState(ctx.user.id, "AUDIO_ACTIVE", "audio");
  await userStateService.setModelForSection(ctx.user.id, "audio", modelId);

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
      await ctx.reply(`${model.name}\n\n${model.description}\n\n${hint}\n\n${costLine}`, {
        reply_markup: kb,
      });
      return;
    }
  }

  await ctx.reply(hint);
}

// ── Voice cloning: accepts audio/voice file, creates EL voice ────────────────

export async function handleVoiceCloneUpload(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const file = ctx.message?.voice ?? ctx.message?.audio;
  if (!file) return;

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

    // 3. Clone voice on ElevenLabs (with LRU eviction on limit error)
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const cloneSettings = allSettings["voice-clone"] ?? {};
    const removeBackgroundNoise = Boolean(cloneSettings.remove_background_noise ?? false);

    let voiceId: string;
    try {
      voiceId = await ElevenLabsAdapter.cloneVoice(
        audioBuffer,
        filename,
        name,
        removeBackgroundNoise,
      );
    } catch (err) {
      // ElevenLabs returns 400 with voice_limit_reached when the slot limit is exceeded
      if (err instanceof Error && err.message.includes("voice_limit_reached")) {
        // Evict the least recently used voice for this user
        const lruVoice = await db.userVoice.findFirst({
          where: { provider: "elevenlabs", externalId: { not: null } },
          orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
          select: { id: true, externalId: true },
        });
        if (!lruVoice) throw err;
        // Delete the LRU voice slot from ElevenLabs only (keep DB record — audioS3Key lets us recreate it)
        await ElevenLabsAdapter.deleteVoice(lruVoice.externalId!);
        await db.userVoice.update({
          where: { id: lruVoice.id },
          data: { externalId: null },
        });
        // Retry cloning
        voiceId = await ElevenLabsAdapter.cloneVoice(
          audioBuffer,
          filename,
          name,
          removeBackgroundNoise,
        );
      } else {
        throw err;
      }
    }

    // 4. Upload original audio to S3 for future voice recreation
    const ext = filename.split(".").pop() ?? "ogg";
    const audioS3Key = buildS3Key("voices", ctx.user.id.toString(), voiceId, ext);
    await uploadBuffer(audioS3Key, audioBuffer, `audio/${ext}`).catch(() => null);

    // 5. Fetch preview URL from ElevenLabs
    const previewUrl = await ElevenLabsAdapter.getPreviewUrl(
      voiceId,
      config.ai.elevenlabs ?? "",
    ).catch(() => null);

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
      },
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(ctx.t.audio.voiceCloneSuccess.replace("{name}", name));
  } catch (err) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    logger.error(err, "Voice clone error");
    await ctx.reply(ctx.t.audio.voiceCloneFailed);
  }
}

// ── Incoming prompt in AUDIO_ACTIVE state ─────────────────────────────────────

export async function handleAudioMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.audioModelId ?? "tts-openai";
  const prompt = ctx.message.text;

  const pendingMsg = await ctx.reply(ctx.t.audio.processing);

  try {
    const result = await audioGenerationService.submitAudio({
      userId: ctx.user.id,
      modelId,
      prompt,
      telegramChatId: chatId,
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

    if (!result.isPending) {
      const audio = result.audioBuffer
        ? new InputFile(result.audioBuffer, `audio.${result.audioExt ?? "mp3"}`)
        : result.audioUrl!;
      await ctx.replyWithAudio(audio, { caption: `🎧 ${prompt.slice(0, 200)}` });
    } else {
      // Async (Suno music) — worker will notify when done
      await ctx.reply(ctx.t.audio.asyncPending);
    }
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else {
      logger.error(err, "Audio message error");
      await ctx.reply(ctx.t.audio.generationFailed);
    }
  }
}
