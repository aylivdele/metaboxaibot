import type { BotContext } from "../types/context.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.keyboard.js";

export async function handleMenu(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.start.mainMenuTitle, {
    reply_markup: buildMainMenuKeyboard(ctx.t),
  });
}

export async function handleGpt(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.gpt.sectionTitle, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.gpt.newDialog }, { text: ctx.t.gpt.activateEditor }],
        [{ text: ctx.t.gpt.management }, { text: ctx.t.gpt.prompts }],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

export async function handleDesign(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.design.sectionTitle, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.design.newDialog }, { text: ctx.t.design.management }],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

export async function handleAudio(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.audio.sectionTitle, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.audio.tts }, { text: ctx.t.audio.voiceClone }],
        [{ text: ctx.t.audio.music }, { text: ctx.t.audio.sounds }],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

export async function handleVideo(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.video.sectionTitle, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.video.newDialog }],
        [{ text: ctx.t.video.avatars }, { text: ctx.t.video.lipSync }],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}
