import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../types/context.js";
import { getT } from "@metabox/shared";

export const i18nMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const lang = ctx.user?.language ?? "en";
  ctx.t = getT(lang);
  return next();
};
