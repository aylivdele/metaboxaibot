import type { Context } from "grammy";
import type { UserDto, Translations } from "@metabox/shared";

export interface BotContext extends Context {
  user?: UserDto;
  t: Translations;
}
