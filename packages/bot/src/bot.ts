import { Bot } from "grammy";
import type { BotContext } from "./types/context.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { i18nMiddleware } from "./middlewares/i18n.middleware.js";
import { handleStart, handleLanguageSelect } from "./commands/start.js";
import { handleMenu, handleGpt, handleDesign, handleAudio, handleVideo } from "./commands/menu.js";
import { handleNoTool } from "./handlers/no-tool.handler.js";
import { handleNewGptDialog, handleGptMessage, handleActivateGptEditor } from "./scenes/gpt.js";
import {
  handleDesignModelSelect,
  handleDesignMessage,
  handleNewDesignDialog,
} from "./scenes/design.js";
import {
  handleVideoModelSelect,
  handleVideoMessage,
  handleNewVideoDialog,
} from "./scenes/video.js";
import { handleAudioSubSection, handleAudioMessage } from "./scenes/audio.js";
import { userStateService } from "@metabox/api/services";
import { getT } from "@metabox/shared";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware.js";
import { logger } from "./logger.js";

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // ── Global middlewares ───────────────────────────────────────────────────
  bot.use(authMiddleware);
  bot.use(i18nMiddleware);
  bot.use(rateLimitMiddleware);

  // ── Commands ─────────────────────────────────────────────────────────────
  bot.command("start", handleStart);
  bot.command("menu", handleMenu);
  bot.command("gpt", handleGpt);
  bot.command("design", handleDesign);
  bot.command("audio", handleAudio);
  bot.command("video", handleVideo);

  // ── Language selection callback ───────────────────────────────────────────
  bot.callbackQuery(/^lang_/, handleLanguageSelect);

  // ── Design model selection callback ──────────────────────────────────────
  bot.callbackQuery(/^design_model_/, handleDesignModelSelect);

  // ── Video model selection callback ───────────────────────────────────────
  bot.callbackQuery(/^video_model_/, handleVideoModelSelect);

  // ── Reply keyboard — menu navigation ─────────────────────────────────────
  // Translation keys are resolved at runtime after i18n middleware runs.
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
      // GPT section buttons
      [t.gpt.newDialog]: () => handleNewGptDialog(ctx),
      [t.gpt.activateEditor]: () => handleActivateGptEditor(ctx),
      // Design section buttons
      [t.design.newDialog]: () => handleNewDesignDialog(ctx),
      // Video section buttons
      [t.video.newDialog]: () => handleNewVideoDialog(ctx),
      // Audio section buttons
      [t.audio.tts]: () => handleAudioSubSection(ctx, "tts-openai"),
      [t.audio.voiceClone]: () => handleAudioSubSection(ctx, "voice-clone"),
      [t.audio.music]: () => handleAudioSubSection(ctx, "suno"),
      [t.audio.sounds]: () => handleAudioSubSection(ctx, "sounds-el"),
    };

    const handler = menuMap[text];
    if (handler) return handler();

    return next();
  });

  // ── State-based message routing ───────────────────────────────────────────
  bot.on("message", async (ctx, next) => {
    if (!ctx.user) return next();

    const state = await userStateService.get(ctx.user.id);
    if (state?.state === "GPT_ACTIVE") return handleGptMessage(ctx);
    if (state?.state === "DESIGN_ACTIVE") return handleDesignMessage(ctx);
    if (state?.state === "VIDEO_ACTIVE") return handleVideoMessage(ctx);
    if (state?.state === "AUDIO_ACTIVE") return handleAudioMessage(ctx);

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
