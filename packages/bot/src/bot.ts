import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "./types/context.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { i18nMiddleware } from "./middlewares/i18n.middleware.js";
import {
  handleStart,
  handleLanguageSelect,
  handleLanguageMenu,
  handleLanguageChangeSelect,
  handleOnboardingOk,
} from "./commands/start.js";
import { buildLanguageKeyboard } from "./keyboards/language.keyboard.js";
import { handleMenu, handleGpt, handleDesign, handleAudio, handleVideo } from "./commands/menu.js";
import { handleNoTool } from "./handlers/no-tool.handler.js";
import {
  handleNewGptDialog,
  handleGptMessage,
  handleGptPhoto,
  handleGptDocument,
  handleGptVoice,
} from "./scenes/gpt.js";
import {
  buildDesignModelKeyboard,
  handleDesignModelSelect,
  handleDesignFamilySelect,
  handleDesignMessage,
  handleDesignVoice,
  handleDesignPhoto,
  handleDesignMediaInput,
  handleDesignMediaInputCancel,
  handleDesignMediaInputRemove,
} from "./scenes/design.js";
import {
  handleVideoModelSelect,
  handleVideoFamilySelect,
  handleVideoMessage,
  handleVideoPhoto,
  handleVideoVideo,
  handleVideoVoice,
  handleVideoAvatarVoiceCallback,
  handleVideoTranscribeCallback,
  handleNewVideoDialog,
  handleVideoAvatars,
  handleAvatarPhotoCapture,
  handleHeygenAvatarCancel,
  handleVideoMediaInput,
  handleVideoMediaInputCancel,
  handleVideoMediaInputDone,
  handleVideoMediaInputRemove,
} from "./scenes/video.js";
import {
  handleRefineEntry,
  handleRefineUseActive,
  handleRefineChooseModel,
  handleRefineSection,
  handleRefineModel,
  handleRefineSlot,
} from "./scenes/refine.js";
import {
  handleAudioSubSection,
  handleAudioMessage,
  handleAudioVoice,
  handleVoiceCloneUpload,
} from "./scenes/audio.js";
import { handleSendOriginal } from "./handlers/send-original.handler.js";
import { handleVoicePromptCallback } from "./handlers/voice-prompt.handler.js";
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

  // ── Language selection gate ──────────────────────────────────────────────
  // While a user is in AWAITING_LANGUAGE state, block everything except
  // /start command and lang_* callback queries. Reply with a bilingual prompt.
  bot.use(async (ctx, next) => {
    if (!ctx.user) return next();

    // Always allow /start to (re)initialise the flow.
    if (ctx.message?.text?.startsWith("/start")) return next();
    // Always allow language selection callback itself.
    if (ctx.callbackQuery?.data?.startsWith("lang_")) return next();

    const state = await userStateService.get(ctx.user.id);
    if (state?.state !== "AWAITING_LANGUAGE") return next();

    // Blocked — prompt bilingually and re-show the keyboard.
    const ru = getT("ru");
    const en = getT("en");
    const prompt = `${ru.start.selectLanguagePrompt}\n${en.start.selectLanguagePrompt}`;
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => void 0);
    }
    if (ctx.chat) {
      await ctx.reply(prompt, { reply_markup: buildLanguageKeyboard() }).catch(() => void 0);
    }
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
  // In-menu language change (keeps current state, no welcome/balance) ────────
  bot.callbackQuery(/^langset_/, handleLanguageChangeSelect);

  // ── Onboarding "Got it" callback ──────────────────────────────────────────
  bot.callbackQuery("onboarding_ok", handleOnboardingOk);

  // ── Design model selection callback ──────────────────────────────────────
  bot.callbackQuery(/^design_model_/, handleDesignModelSelect);
  bot.callbackQuery(/^design_family_/, handleDesignFamilySelect);

  // ── Design reference (img2img) callback ───────────────────────────────────
  // ── Refine flow (cross-section) ────────────────────────────────────────────
  bot.callbackQuery(/^design_ref_/, handleRefineEntry);
  bot.callbackQuery(/^ref_use:/, handleRefineUseActive);
  bot.callbackQuery(/^ref_choose:/, handleRefineChooseModel);
  bot.callbackQuery(/^ref_sec:/, handleRefineSection);
  bot.callbackQuery(/^ref_mdl:/, handleRefineModel);
  bot.callbackQuery(/^ref_slt:/, handleRefineSlot);

  // ── Video model selection callback ───────────────────────────────────────
  bot.callbackQuery(/^video_model_/, handleVideoModelSelect);
  bot.callbackQuery(/^video_family_/, handleVideoFamilySelect);

  // ── Media input slot callbacks ────────────────────────────────────────────
  bot.callbackQuery(/^mi:video:/, handleVideoMediaInput);
  bot.callbackQuery(/^mi:design:/, handleDesignMediaInput);
  bot.callbackQuery(/^mi_cancel:video$/, handleVideoMediaInputCancel);
  bot.callbackQuery(/^mi_cancel:design$/, handleDesignMediaInputCancel);
  bot.callbackQuery(/^mi_done:/, handleVideoMediaInputDone); // section-agnostic: just clears active slot
  bot.callbackQuery(/^mi_remove:video:/, handleVideoMediaInputRemove);
  bot.callbackQuery(/^mi_remove:design:/, handleDesignMediaInputRemove);

  // ── Send original file callback ───────────────────────────────────────────
  bot.callbackQuery(/^orig_/, handleSendOriginal);

  // ── HeyGen avatar creation cancel ────────────────────────────────────────
  bot.callbackQuery("heygen_avatar_cancel", handleHeygenAvatarCancel);

  // ── Merge conflict resolution callbacks ────────────────────────────────────
  bot.callbackQuery(/^merge:(site|bot):/, handleMergeChoice);
  bot.callbackQuery("merge:cancel", handleMergeCancel);
  bot.callbackQuery(/^merge_confirm:(site|bot):/, handleMergeConfirm);

  // ── Section picker callback (from noTool fallback) ───────────────────────
  bot.callbackQuery(/^section:/, async (ctx) => {
    const section = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => void 0);
    if (section === "gpt") return handleGpt(ctx);
    if (section === "design") return handleDesign(ctx);
    if (section === "audio") return handleAudio(ctx);
    if (section === "video") return handleVideo(ctx);
  });

  // ── Voice transcription prompt callback ──────────────────────────────────
  bot.callbackQuery(/^vp:/, handleVoicePromptCallback);
  // ── Video avatar voice choice callbacks ─────────────────────────────────
  bot.callbackQuery(/^va:/, handleVideoAvatarVoiceCallback);
  bot.callbackQuery(/^vt:/, handleVideoTranscribeCallback);

  // ── Audio model selection callback ───────────────────────────────────────
  bot.callbackQuery(/^audio_model:/, async (ctx) => {
    const modelId = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => void 0);
    await handleAudioSubSection(ctx, modelId);
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
      // [t.gpt.prompts]: () => handleGptPrompts(ctx),
      // Design section buttons
      [t.design.chooseModel]: async () => {
        await ctx.reply(t.design.sectionTitle, { reply_markup: buildDesignModelKeyboard() });
      },
      // Video section buttons
      [t.video.newDialog]: () => handleNewVideoDialog(ctx),
      [t.video.avatars]: () => handleVideoAvatars(ctx),
      [t.video.lipSync]: () => handleVideoAvatars(ctx),
      // Language button — inline language picker (no state change)
      [t.menu.language]: () => handleLanguageMenu(ctx),
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
        await ctx.reply(t.audio.chooseTtsProvider, {
          reply_markup: new InlineKeyboard()
            .text(t.audio.ttsOpenai, "audio_model:tts-openai")
            .row()
            .text(t.audio.ttsEl, "audio_model:tts-el"),
        });
      },
      [t.audio.voiceClone]: () => handleAudioSubSection(ctx, "voice-clone"),
      [t.audio.music]: async () => {
        await ctx.reply(t.audio.chooseMusicProvider, {
          reply_markup: new InlineKeyboard()
            .text(t.audio.musicSuno, "audio_model:suno")
            .row()
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
      if (ctx.message?.document) return handleGptDocument(ctx);
      if (ctx.message?.voice || ctx.message?.audio) return handleGptVoice(ctx);
      return handleGptMessage(ctx);
    }
    if (state?.state === "DESIGN_ACTIVE") {
      // Photo or image file sent in design state → set as img2img reference
      if (ctx.message?.photo) return handleDesignPhoto(ctx);
      if (ctx.message?.document?.mime_type?.startsWith("image/")) return handleDesignPhoto(ctx);
      if (ctx.message?.voice || ctx.message?.audio) return handleDesignVoice(ctx);
      return handleDesignMessage(ctx);
    }
    if (state?.state === "VIDEO_ACTIVE") {
      if (ctx.message?.photo) return handleVideoPhoto(ctx);
      if (ctx.message?.document?.mime_type?.startsWith("image/")) return handleVideoPhoto(ctx);
      if (ctx.message?.video) return handleVideoVideo(ctx);
      if (ctx.message?.voice || ctx.message?.audio) return handleVideoVoice(ctx);
      return handleVideoMessage(ctx);
    }
    if (state?.state === "HEYGEN_AVATAR_PHOTO") {
      if (ctx.message?.photo) return handleAvatarPhotoCapture(ctx);
      if (ctx.message?.document?.mime_type?.startsWith("image/"))
        return handleAvatarPhotoCapture(ctx);
      return; // ignore non-image messages while waiting for avatar photo
    }
    if (state?.state === "AUDIO_ACTIVE") {
      if (state.audioModelId === "voice-clone") {
        if (ctx.message?.voice || ctx.message?.audio) return handleVoiceCloneUpload(ctx);
        await ctx.reply(ctx.t.audio.voiceCloneNeedsAudio);
        return;
      }
      if (ctx.message?.voice || ctx.message?.audio) return handleAudioVoice(ctx);
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
