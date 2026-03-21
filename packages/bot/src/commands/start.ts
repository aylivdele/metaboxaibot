import { InlineKeyboard } from "grammy";
import type { BotContext } from "../types/context.js";
import { userService } from "../services/user.service.js";
import { userStateService } from "@metabox/api/services";
import { buildLanguageKeyboard } from "../keyboards/language.keyboard.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.keyboard.js";
import { SUPPORTED_LANGUAGES, getT, config } from "@metabox/shared";
import type { Language, Translations } from "@metabox/shared";

/**
 * /start — resets FSM state and shows language selection.
 */
export async function handleStart(ctx: BotContext): Promise<void> {
  if (ctx.user) {
    await userStateService.setState(ctx.user.id, "IDLE");
  }
  await ctx.reply(ctx.t.start.welcome, {
    reply_markup: buildLanguageKeyboard(),
    parse_mode: "HTML",
  });
}

/**
 * Callback handler for language selection buttons (data: lang_<code>).
 * Sets language, credits welcome bonus for new users, sends welcome messages.
 */
export async function handleLanguageSelect(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const lang = data.replace("lang_", "") as Language;

  if (!SUPPORTED_LANGUAGES.includes(lang) || !ctx.user) {
    await ctx.answerCallbackQuery();
    return;
  }

  await ctx.answerCallbackQuery();

  const isNew = ctx.user.isNew;
  const updatedUser = await userService.setLanguage(ctx.user.id, lang);
  const t = getT(lang);

  if (isNew) {
    await userService.creditWelcomeBonus(ctx.user.id);
  }

  // Inline button to open Profile in mini app
  const webappUrl = config.bot.webappUrl;
  const profileKb = webappUrl
    ? new InlineKeyboard().webApp(t.menu.profile, `${webappUrl}#profile`)
    : undefined;

  // New users: show tokens credited; returning users: show current balance
  if (isNew) {
    await ctx.reply(t.start.tokensGranted, profileKb ? { reply_markup: profileKb } : undefined);
  } else {
    const balance = (updatedUser.tokenBalance as number).toFixed(2);
    const balanceText = t.start.yourBalance.replace("{balance}", balance);
    await ctx.reply(balanceText, profileKb ? { reply_markup: profileKb } : undefined);
  }

  // Main menu with reply keyboard
  await ctx.reply(t.start.mainMenuTitle, {
    reply_markup: buildMainMenuKeyboard(t),
  });

  // Set per-chat bot commands in user's language
  if (ctx.chat?.id) {
    await ctx.api
      .setMyCommands(buildCommands(t), { scope: { type: "chat", chat_id: ctx.chat.id } })
      .catch(() => void 0);
  }

  ctx.user = { ...updatedUser, isNew: false };
}

function buildCommands(t: Translations) {
  return [
    { command: "start", description: t.start.restart },
    { command: "menu", description: t.start.mainMenuTitle.split("\n")[0] },
    // { command: "profile", description: t.menu.profile },
    { command: "gpt", description: t.menu.gpt },
    { command: "design", description: t.menu.design },
    { command: "audio", description: t.menu.audio },
    { command: "video", description: t.menu.video },
  ];
}
