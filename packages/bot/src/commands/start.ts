import { InlineKeyboard } from "grammy";
import type { BotContext } from "../types/context.js";
import { userService } from "../services/user.service.js";
import { userStateService } from "@metabox/api/services";
import { db } from "@metabox/api/db";
import { buildLanguageKeyboard } from "../keyboards/language.keyboard.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.keyboard.js";
import { SUPPORTED_LANGUAGES, getT, config } from "@metabox/shared";
import type { Language, Translations } from "@metabox/shared";
import { verifyLinkToken } from "@metabox/api/services";

/**
 * /start — handles deep link params, resets FSM state, shows language selection.
 *
 * Supported deep link params:
 *   /start link_<TOKEN>  — Metabox→Bot account linking (TelegramAuthToken)
 *   /start ref_<TG_ID>   — referral link from another bot user
 */
export async function handleStart(ctx: BotContext): Promise<void> {
  const param = ctx.match as string | undefined;

  // ── Metabox→Bot account linking ────────────────────────────────────────────
  if (param?.startsWith("link_") && ctx.user) {
    const token = param.slice("link_".length);
    try {
      const { metaboxUserId, referralCode } = await verifyLinkToken(token, ctx.user.id);
      await db.user.update({
        where: { id: ctx.user.id },
        data: { metaboxUserId, metaboxReferralCode: referralCode },
      });
      await ctx.reply(ctx.t.start.metaboxLinked ?? "✅ Аккаунт Metabox успешно привязан!");
    } catch {
      await ctx.reply(
        ctx.t.start.metaboxLinkFailed ?? "❌ Не удалось привязать аккаунт. Попробуйте ещё раз.",
      );
    }
    return;
  }

  // ── Referral deep link ─────────────────────────────────────────────────────
  if (param?.startsWith("ref_") && ctx.user) {
    const referrerIdStr = param.slice("ref_".length);
    const referrerId = BigInt(referrerIdStr);
    if (referrerId !== ctx.user.id && !ctx.user.referredById) {
      // Only set referredById if the referrer actually exists in the bot DB.
      // They may have shared the link from Metabox without ever starting the bot.
      const referrerExists = await db.user.findUnique({
        where: { id: referrerId },
        select: { id: true },
      });
      if (referrerExists) {
        await db.user.update({
          where: { id: ctx.user.id },
          data: { referredById: referrerId },
        });
      }
    }
  }

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
    ? new InlineKeyboard().webApp(t.menu.profile, `${webappUrl}?page=profile`)
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
    reply_markup: buildMainMenuKeyboard(t, ctx.user?.id),
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
