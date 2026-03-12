import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../types/context.js";

/** Blocks the update if user has no tokens. Used before AI generation handlers. */
export const tokenCheckMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const balance = ctx.user?.tokenBalance ?? 0;
  if (balance <= 0) {
    await ctx.reply(ctx.t.errors.insufficientTokens);
    return;
  }
  return next();
};
