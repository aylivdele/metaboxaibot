import type { BotContext } from "../types/context.js";
import { config } from "@metabox/shared";

/**
 * Builds an inline keyboard with a "Тарифы" button that opens the tariffs page
 * in the Mini App. Returns undefined if WEBAPP_URL is not configured.
 */
function tariffsKeyboard(ctx: BotContext) {
  const webappUrl = config.bot.webappUrl;
  if (!webappUrl) return undefined;
  return {
    inline_keyboard: [
      [{ text: ctx.t.common.tariffs, web_app: { url: `${webappUrl}?page=tariffs` } }],
    ],
  };
}

/** Replies with the noSubscription error + Тарифы button. */
export async function replyNoSubscription(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.errors.noSubscription, { reply_markup: tariffsKeyboard(ctx) });
}

/** Replies with the insufficientTokens error + Тарифы button. */
export async function replyInsufficientTokens(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.errors.insufficientTokens, { reply_markup: tariffsKeyboard(ctx) });
}
