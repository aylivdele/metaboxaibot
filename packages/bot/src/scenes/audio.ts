import { InputFile } from "grammy";
import type { BotContext } from "../types/context.js";
import { audioGenerationService, userStateService } from "@metabox/api/services";
import { logger } from "../logger.js";

// ── Sub-section entry points ──────────────────────────────────────────────────

/**
 * Called when user presses one of the audio sub-section reply buttons.
 * Sets AUDIO_ACTIVE state with the correct modelId and sends instructions.
 */
export async function handleAudioSubSection(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;

  await userStateService.setState(ctx.user.id, "AUDIO_ACTIVE", "audio");
  await userStateService.setModel(ctx.user.id, modelId);

  const instructions: Record<string, string> = {
    "tts-openai": "🗣 Text-to-Speech activated.\nSend me any text and I will convert it to speech.",
    "voice-clone":
      "🎙 Voice synthesis activated.\nSend me a text and it will be spoken in a natural AI voice.",
    suno: "🎵 Music generation activated.\nDescribe the music you want (genre, mood, style) and I will create it.",
    "sounds-el":
      '🔊 Sound effects activated.\nDescribe the sound you want (e.g. "rain on a window", "thunder") and I will generate it.',
  };

  const msg = instructions[modelId] ?? `🎧 ${modelId} activated.\nSend me your request.`;
  await ctx.reply(msg);
}

// ── Incoming prompt in AUDIO_ACTIVE state ─────────────────────────────────────

export async function handleAudioMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.modelId ?? "tts-openai";
  const prompt = ctx.message.text;

  const pendingMsg = await ctx.reply("🎧 Processing your audio request...");

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
      await ctx.reply(
        "⏳ Your audio is being generated. You will receive it as soon as it's ready.",
      );
    }
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      logger.error(err, "Audio message error");
      await ctx.reply("❌ Audio generation failed. Please try again.");
    }
  }
}
