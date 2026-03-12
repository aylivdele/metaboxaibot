import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../types/context.js";
import { userService } from "../services/user.service.js";
import { getT } from "@metabox/shared";

export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.from) return next();

  const { id, username, first_name, last_name } = ctx.from;
  const user = await userService.upsert({
    id: BigInt(id),
    username,
    firstName: first_name,
    lastName: last_name,
  });

  if (user.isBlocked) {
    await ctx.reply(getT("en").errors.userBlocked);
    return;
  }

  ctx.user = user;
  return next();
};
