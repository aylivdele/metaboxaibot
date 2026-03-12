import { Bot } from "grammy";
import type { BotContext } from "./types/context.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { i18nMiddleware } from "./middlewares/i18n.middleware.js";
import { handleStart, handleLanguageSelect } from "./commands/start.js";
import { handleMenu, handleGpt, handleDesign, handleAudio, handleVideo } from "./commands/menu.js";
import { handleNoTool } from "./handlers/no-tool.handler.js";
import { getT } from "@metabox/shared";
import { logger } from "./logger.js";

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // ── Global middlewares ───────────────────────────────────────────────────
  bot.use(authMiddleware);
  bot.use(i18nMiddleware);

  // ── Commands ─────────────────────────────────────────────────────────────
  bot.command("start", handleStart);
  bot.command("menu", handleMenu);
  bot.command("gpt", handleGpt);
  bot.command("design", handleDesign);
  bot.command("audio", handleAudio);
  bot.command("video", handleVideo);

  // ── Language selection callback ───────────────────────────────────────────
  bot.callbackQuery(/^lang_/, handleLanguageSelect);

  // ── Reply keyboard — main menu buttons ───────────────────────────────────
  // These keys are resolved at runtime from translations, so we match by
  // checking ctx.t after i18n middleware has run.
  bot.on("message:text", async (ctx, next) => {
    const t = ctx.t;
    const text = ctx.message.text;

    const menuMap: Record<string, () => Promise<void>> = {
      [t.menu.gpt]: () => handleGpt(ctx),
      [t.menu.design]: () => handleDesign(ctx),
      [t.menu.audio]: () => handleAudio(ctx),
      [t.menu.video]: () => handleVideo(ctx),
      [t.common.backToMain]: () => handleMenu(ctx),
      [t.gpt.backToMain]: () => handleMenu(ctx),
      [t.design.backToMain]: () => handleMenu(ctx),
      [t.audio.backToMain]: () => handleMenu(ctx),
      [t.video.backToMain]: () => handleMenu(ctx),
    };

    const handler = menuMap[text];
    if (handler) {
      return handler();
    }

    return next();
  });

  // ── Fallback: no tool selected ────────────────────────────────────────────
  bot.on("message", handleNoTool);

  // ── Error handler ─────────────────────────────────────────────────────────
  bot.catch((err) => {
    logger.error({ err, update: err.ctx.update }, "Unhandled bot error");
    const t = err.ctx.t ?? getT("en");
    err.ctx.reply(t.errors.noTool).catch(() => void 0);
  });

  return bot;
}
