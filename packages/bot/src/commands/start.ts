import type { BotContext } from "../types/context.js";
import { userService } from "../services/user.service.js";
import { buildLanguageKeyboard } from "../keyboards/language.keyboard.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.keyboard.js";
import { SUPPORTED_LANGUAGES, getT } from "@metabox/shared";
import type { Language } from "@metabox/shared";

/**
 * /start — shows language selection for all users.
 * After picking a language, sendWelcome() is called.
 */
export async function handleStart(ctx: BotContext): Promise<void> {
  const t = ctx.t;
  await ctx.reply(t.start.welcome, {
    reply_markup: buildLanguageKeyboard(),
  });
}

/**
 * Callback handler for language selection buttons (data: lang_<code>).
 * Sets language, credits welcome bonus for new users, sends 3 welcome messages.
 */
export async function handleLanguageSelect(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const lang = data.replace("lang_", "") as Language;

  if (!SUPPORTED_LANGUAGES.includes(lang) || !ctx.user) {
    await ctx.answerCallbackQuery();
    return;
  }

  // Acknowledge the button click
  await ctx.answerCallbackQuery();

  const isNew = ctx.user.isNew;
  const updatedUser = await userService.setLanguage(ctx.user.id, lang);
  const t = getT(lang);

  if (isNew) {
    await userService.creditWelcomeBonus(ctx.user.id);
  }

  // Message 1: tokens granted
  await ctx.reply(t.start.tokensGranted);

  // Message 2: brief video intro
  await ctx.reply(t.start.videoIntro, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t.start.howToVideo_vk, url: "https://vk.com/metaboxai" },
          { text: t.start.howToVideo_yt, url: "https://youtube.com/@metaboxai" },
        ],
        [
          { text: t.start.knowledgeBase, url: "https://t.me/metaboxai_bot" },
          { text: t.start.channel, url: "https://t.me/metaboxai" },
        ],
      ],
    },
  });

  // Message 3: main menu with reply keyboard
  await ctx.reply(t.start.mainMenuTitle, {
    reply_markup: buildMainMenuKeyboard(t),
  });

  // Update ctx.user for downstream middleware in same request
  ctx.user = { ...updatedUser, isNew: false };
}
