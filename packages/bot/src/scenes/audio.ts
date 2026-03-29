import { InputFile } from "grammy";
import type { BotContext } from "../types/context.js";
import { audioGenerationService, userStateService } from "@metabox/api/services";
import { logger } from "../logger.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";

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
    "voice-clone": ctx.t.audio.voiceCloneActivated,
    suno: ctx.t.audio.musicActivated,
    "sounds-el": ctx.t.audio.soundsActivated,
  };

  await ctx.reply(instructions[modelId] ?? ctx.t.audio.activated);
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
