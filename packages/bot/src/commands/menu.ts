import type { BotContext } from "../types/context.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.keyboard.js";
import { userStateService, dialogService } from "@metabox/api/services";
import { config } from "@metabox/shared";
import type { Section } from "@metabox/shared";

/** Returns the active dialog name for a section, or undefined. */
async function activeDialogLabel(userId: bigint, section: string): Promise<string | undefined> {
  const dialogId = await userStateService.getDialogForSection(userId, section as Section);
  if (!dialogId) return undefined;
  const dialog = await dialogService.findById(dialogId);
  if (!dialog) return undefined;
  return dialog.title ?? dialog.modelId;
}

export async function handleMenu(ctx: BotContext): Promise<void> {
  if (ctx.user) {
    await userStateService.setState(ctx.user.id, "MAIN_MENU");
  }
  await ctx.reply(ctx.t.start.mainMenuTitle, {
    reply_markup: buildMainMenuKeyboard(ctx.t),
  });
}

export async function handleGpt(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const dialogLabel = await activeDialogLabel(ctx.user.id, "gpt");
  await userStateService.setState(ctx.user.id, "GPT_SECTION", "gpt");
  const text = dialogLabel
    ? `${ctx.t.gpt.sectionTitle}\n\n💬 Активный диалог: ${dialogLabel}`
    : ctx.t.gpt.sectionTitle;

  const webappUrl = config.bot.webappUrl;
  const managementBtn = webappUrl
    ? { text: ctx.t.gpt.management, web_app: { url: `${webappUrl}?page=management&section=gpt` } }
    : { text: ctx.t.gpt.management };

  await ctx.reply(text, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.gpt.newDialog }],
        [{ text: ctx.t.gpt.activateEditor }],
        [managementBtn, { text: ctx.t.gpt.prompts }],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

export async function handleDesign(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const dialogLabel = await activeDialogLabel(ctx.user.id, "design");
  await userStateService.setState(ctx.user.id, "DESIGN_SECTION", "design");
  const text = dialogLabel
    ? `${ctx.t.design.sectionTitle}\n\n💬 ${dialogLabel}`
    : ctx.t.design.sectionTitle;

  const webappUrl = config.bot.webappUrl;
  const managementBtn = webappUrl
    ? { text: ctx.t.design.management, web_app: { url: `${webappUrl}?page=management&section=design` } }
    : { text: ctx.t.design.management };

  await ctx.reply(text, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.design.newDialog }, managementBtn],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

export async function handleAudio(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "AUDIO_SECTION", "audio");
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
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_SECTION", "video");
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
