import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "./types/context.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { i18nMiddleware } from "./middlewares/i18n.middleware.js";
import { handleStart, handleLanguageSelect } from "./commands/start.js";
import { handleMenu, handleGpt, handleDesign, handleAudio, handleVideo } from "./commands/menu.js";
import { handleNoTool } from "./handlers/no-tool.handler.js";
import {
  handleNewGptDialog,
  handleGptMessage,
  handleGptPhoto,
  handleGptPrompts,
} from "./scenes/gpt.js";
import {
  buildDesignModelKeyboard,
  handleDesignModelSelect,
  handleDesignFamilySelect,
  handleDesignMessage,
  handleDesignPhoto,
  handleDesignRefSelect,
} from "./scenes/design.js";
import {
  handleVideoModelSelect,
  handleVideoFamilySelect,
  handleVideoMessage,
  handleVideoPhoto,
  handleVideoVideo,
  handleVideoVoice,
  handleNewVideoDialog,
  handleVideoAvatars,
  handleVideoLipSync,
  handleAvatarPhotoCapture,
  handleHeygenAvatarCancel,
} from "./scenes/video.js";
import {
  handleAudioSubSection,
  handleAudioMessage,
  handleVoiceCloneUpload,
} from "./scenes/audio.js";
import { handleSendOriginal } from "./handlers/send-original.handler.js";
import {
  handleMergeChoice,
  handleMergeCancel,
  handleMergeConfirm,
} from "./handlers/merge-conflict.handler.js";
import { handlePreCheckoutQuery, handleSuccessfulPayment } from "./scenes/payment.js";
import { userStateService } from "@metabox/api/services";
import { getT, config } from "@metabox/shared";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware.js";
import { logger } from "./logger.js";

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // ── Raw update logger (debug payments) ──────────────────────────────────
  bot.use(async (ctx, next) => {
    const updateType = Object.keys(ctx.update)
      .filter((k) => k !== "update_id")
      .join(",");
    if (updateType.includes("pre_checkout") || updateType.includes("payment")) {
      logger.info({ updateType, updateId: ctx.update.update_id }, "RAW UPDATE (payment-related)");
    }
    return next();
  });

  // ── Global middlewares ───────────────────────────────────────────────────
  bot.use(authMiddleware);
  bot.use(i18nMiddleware);
  bot.use(rateLimitMiddleware);

  // ── Private chats only — ignore all group/channel updates ────────────────
  // Updates without ctx.chat (e.g. pre_checkout_query) must always pass through.
  bot.use(async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type === "private") return next();
  });

  // ── Commands ─────────────────────────────────────────────────────────────
  bot.command("start", handleStart);
  bot.command("menu", handleMenu);
  bot.command("profile", async (ctx) => {
    const webappUrl = config.bot.webappUrl;
    if (!webappUrl || !ctx.t) return;
    const kb = new InlineKeyboard().webApp(ctx.t.menu.profile, `${webappUrl}?page=profile`);
    await ctx.reply(ctx.t.menu.profile, { reply_markup: kb });
  });
  bot.command("gpt", handleGpt);
  bot.command("design", handleDesign);
  bot.command("audio", handleAudio);
  bot.command("video", handleVideo);

  // ── Language selection callback ───────────────────────────────────────────
  bot.callbackQuery(/^lang_/, handleLanguageSelect);

  // ── Design model selection callback ──────────────────────────────────────
  bot.callbackQuery(/^design_model_/, handleDesignModelSelect);
  bot.callbackQuery(/^design_family_/, handleDesignFamilySelect);

  // ── Design reference (img2img) callback ───────────────────────────────────
  bot.callbackQuery(/^design_ref_/, handleDesignRefSelect);

  // ── Video model selection callback ───────────────────────────────────────
  bot.callbackQuery(/^video_model_/, handleVideoModelSelect);
  bot.callbackQuery(/^video_family_/, handleVideoFamilySelect);

  // ── Send original file callback ───────────────────────────────────────────
  bot.callbackQuery(/^orig_/, handleSendOriginal);

  // ── HeyGen avatar creation cancel ────────────────────────────────────────
  bot.callbackQuery("heygen_avatar_cancel", handleHeygenAvatarCancel);

  // ── Merge conflict resolution callbacks ────────────────────────────────────
  bot.callbackQuery(/^merge:(site|bot):/, handleMergeChoice);
  bot.callbackQuery("merge:cancel", handleMergeCancel);
  bot.callbackQuery(/^merge_confirm:(site|bot):/, handleMergeConfirm);

  // ── Audio model selection callback ───────────────────────────────────────
  bot.callbackQuery(/^audio_model:/, async (ctx) => {
    const modelId = ctx.callbackQuery.data.split(":")[1];
    await handleAudioSubSection(ctx, modelId);
    await ctx.answerCallbackQuery();
  });

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
      [t.gpt.prompts]: () => handleGptPrompts(ctx),
      // Design section buttons
      [t.design.chooseModel]: async () => {
        await ctx.reply(t.design.sectionTitle, { reply_markup: buildDesignModelKeyboard() });
      },
      // Video section buttons
      [t.video.newDialog]: () => handleNewVideoDialog(ctx),
      [t.video.avatars]: () => handleVideoAvatars(ctx),
      [t.video.lipSync]: () => handleVideoLipSync(ctx),
      // Help button — send inline link to support chat
      [t.menu.help]: async () => {
        await ctx.reply(ctx.t.menu.help, {
          reply_markup: new InlineKeyboard().url(
            ctx.t.start.support,
            "https://t.me/metaboxsupport",
          ),
        });
      },
      // Audio section buttons
      [t.audio.tts]: async () => {
        await ctx.reply("Выберите провайдер синтеза речи:", {
          reply_markup: new InlineKeyboard()
            .text(t.audio.ttsOpenai, "audio_model:tts-openai")
            .text(t.audio.ttsEl, "audio_model:tts-el"),
        });
      },
      [t.audio.voiceClone]: () => handleAudioSubSection(ctx, "voice-clone"),
      [t.audio.music]: async () => {
        await ctx.reply("Выберите провайдер генерации музыки:", {
          reply_markup: new InlineKeyboard()
            .text(t.audio.musicSuno, "audio_model:suno")
            .text(t.audio.musicEl, "audio_model:music-el"),
        });
      },
      [t.audio.sounds]: () => handleAudioSubSection(ctx, "sounds-el"),
    };

    const handler = menuMap[text];
    if (handler) return handler();

    return next();
  });

  // ── Telegram Stars payments ───────────────────────────────────────────────
  bot.on("pre_checkout_query", handlePreCheckoutQuery);
  bot.on("message:successful_payment", handleSuccessfulPayment);

  // ── State-based message routing ───────────────────────────────────────────
  bot.on("message", async (ctx, next) => {
    if (!ctx.user) return next();

    const state = await userStateService.get(ctx.user.id);
    if (state?.state === "GPT_ACTIVE" || state?.state === "GPT_SECTION") {
      if (ctx.message?.photo) return handleGptPhoto(ctx);
      if (ctx.message?.document?.mime_type?.startsWith("image/")) return handleGptPhoto(ctx);
      return handleGptMessage(ctx);
    }
    if (state?.state === "DESIGN_ACTIVE") {
      // Photo or image file sent in design state → set as img2img reference
      if (ctx.message?.photo) return handleDesignPhoto(ctx);
      if (ctx.message?.document?.mime_type?.startsWith("image/")) return handleDesignPhoto(ctx);
      return handleDesignMessage(ctx);
    }
    if (state?.state === "VIDEO_ACTIVE") {
      if (ctx.message?.photo) return handleVideoPhoto(ctx);
      if (ctx.message?.document?.mime_type?.startsWith("image/")) return handleVideoPhoto(ctx);
      if (ctx.message?.video) return handleVideoVideo(ctx);
      if (ctx.message?.voice) return handleVideoVoice(ctx);
      return handleVideoMessage(ctx);
    }
    if (state?.state === "HEYGEN_AVATAR_PHOTO") {
      if (ctx.message?.photo) return handleAvatarPhotoCapture(ctx);
      return; // ignore non-photo messages while waiting for avatar photo
    }
    if (state?.state === "AUDIO_ACTIVE") {
      if (state.audioModelId === "voice-clone") {
        if (ctx.message?.voice || ctx.message?.audio) return handleVoiceCloneUpload(ctx);
        await ctx.reply(ctx.t.audio.voiceCloneNeedsAudio);
        return;
      }
      return handleAudioMessage(ctx);
    }

    return next();
  });

  // ── Fallback: no tool selected ────────────────────────────────────────────
  bot.on("message", handleNoTool);

  // ── Error handler ─────────────────────────────────────────────────────────
  bot.catch((err) => {
    const message = err.error instanceof Error ? err.error.message : String(err.error);
    if (
      message.includes("bot was blocked by the user") ||
      message.includes("user is deactivated")
    ) {
      return;
    }
    logger.error({ err, update: err.ctx.update }, "Unhandled bot error");
    const t = err.ctx.t ?? getT("en");
    err.ctx.reply(t.errors.unexpected).catch(() => void 0);
  });

  return bot;
}
