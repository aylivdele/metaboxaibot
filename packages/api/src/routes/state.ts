import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userStateService } from "../services/user-state.service.js";
import { calculateCost, computeVideoTokens } from "../services/token.service.js";
import { db } from "../db.js";
import {
  AI_MODELS,
  config,
  generateWebToken,
  getT,
  resolveModelDisplay,
  type AIModel,
  type Section,
  type Translations,
} from "@metabox/shared";
import type { Language } from "@metabox/shared";
import { logger } from "../logger.js";

type AuthRequest = FastifyRequest & { userId: bigint };

/**
 * Build localised cost line with optional min–max range.
 * Range is derived from costVariants or costMatrix when they differ.
 */
function buildActivationCostLine(
  model: AIModel,
  modelSettings: Record<string, unknown>,
  t: Translations,
  defaultDuration?: number,
): string {
  const isPerMPixel = (model.costUsdPerMPixel ?? 0) > 0;
  const isPerSecond = model.costUsdPerSecond !== undefined && model.costUsdPerSecond > 0;
  const isPerKChar = model.costUsdPerKChar !== undefined;

  if (isPerMPixel) {
    const cost = calculateCost(model, 0, 0, 1.0, undefined, modelSettings);
    return t.common.costPerMPixel.replace("{cost}", cost.toFixed(2));
  }

  if (isPerKChar) {
    if (model.costVariants) {
      const costs = Object.keys(model.costVariants.map).map((k) =>
        calculateCost(
          model,
          0,
          0,
          undefined,
          undefined,
          { [model.costVariants!.settingKey]: k },
          undefined,
          1000,
        ),
      );
      const min = Math.min(...costs);
      const max = Math.max(...costs);
      if (min < max) {
        return t.common.costRangePerKChar
          .replace("{min}", min.toFixed(2))
          .replace("{max}", max.toFixed(2));
      }
    }
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings, undefined, 1000);
    return t.common.costPerKChar.replace("{cost}", cost.toFixed(2));
  }

  // Compute cost range via costVariants
  if (model.costVariants) {
    const durationArg = isPerSecond ? 1 : undefined;
    const costs = Object.keys(model.costVariants.map).map((k) =>
      calculateCost(
        model,
        0,
        0,
        undefined,
        undefined,
        { [model.costVariants!.settingKey]: k },
        durationArg,
      ),
    );
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    if (min < max) {
      if (isPerSecond) {
        return t.common.costRangePerSecond
          .replace("{min}", min.toFixed(2))
          .replace("{max}", max.toFixed(2));
      }
      return t.common.costRangePerRequest
        .replace("{min}", min.toFixed(2))
        .replace("{max}", max.toFixed(2));
    }
    // min === max: fall through to single-value display below
  }

  // Compute cost range via costMatrix
  if (model.costMatrix && !model.costVariants) {
    const costs = Object.values(model.costMatrix.table).map(
      (v) => ((v as number) / config.billing.usdPerToken) * config.billing.targetMargin,
    );
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    if (min < max) {
      return t.common.costRangePerRequest
        .replace("{min}", min.toFixed(2))
        .replace("{max}", max.toFixed(2));
    }
  }

  // Single-value display
  if (isPerSecond) {
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings, 1);
    return t.common.costPerSecond.replace("{cost}", cost.toFixed(2));
  }

  const estimatedVideoTokens =
    model.costUsdPerMVideoToken && defaultDuration
      ? computeVideoTokens(
          model,
          undefined,
          defaultDuration,
          undefined,
          undefined,
          undefined,
          modelSettings?.resolution as string | undefined,
        )
      : undefined;

  const cost = calculateCost(
    model,
    0,
    0,
    undefined,
    estimatedVideoTokens,
    modelSettings,
    defaultDuration,
  );
  return t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
}

/** Send a section-entry message with the appropriate reply keyboard (mirrors bot menu.ts). */
async function sendSectionMessage(
  userId: bigint,
  section: string,
  t: Translations,
  token: string,
  webappUrl: string | undefined,
): Promise<void> {
  const wtoken = webappUrl ? generateWebToken(userId, token) : "";
  const makeMgmtBtn = (label: string) =>
    webappUrl
      ? {
          text: label,
          web_app: {
            url: `${webappUrl}?page=management&section=${section}&wtoken=${wtoken}`,
          },
        }
      : { text: label };

  let text: string;
  let keyboard: { text: string; web_app?: { url: string } }[][];

  if (section === "audio") {
    text = t.audio.sectionTitle;
    keyboard = [
      [{ text: t.audio.tts }, { text: t.audio.voiceClone }],
      [{ text: t.audio.music }, { text: t.audio.sounds }],
      [makeMgmtBtn(t.audio.management)],
      [{ text: t.common.backToMain }],
    ];
  } else if (section === "design") {
    text = t.design.sectionTitle;
    keyboard = [
      [{ text: t.design.chooseModel }],
      [makeMgmtBtn(t.design.management)],
      [{ text: t.common.backToMain }],
    ];
  } else if (section === "video") {
    text = t.video.sectionTitle;
    keyboard = [
      [{ text: t.video.newDialog }],
      [{ text: t.video.avatars }, { text: t.video.lipSync }],
      [makeMgmtBtn(t.video.management)],
      [{ text: t.common.backToMain }],
    ];
  } else {
    return;
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(userId),
      text,
      reply_markup: { keyboard, resize_keyboard: true, is_persistent: true },
    }),
  }).catch((reason) => logger.warn(reason, `Could not send section switch message`));
}

async function sendModelActivatedNotification(
  userId: bigint,
  section: string,
  modelId: string,
  sectionSwitched: boolean,
): Promise<void> {
  const model = AI_MODELS[modelId];
  if (!model || !config.bot.token) return;

  const [user, allSettings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { language: true } }),
    userStateService.getModelSettings(userId),
  ]);
  const t = getT((user?.language ?? "en") as Language);
  const modelSettings = allSettings[modelId] ?? {};

  // Section switch (state/section) was already performed synchronously in the route handler.
  // Here we only send the optional section-switch keyboard message if needed.
  if (sectionSwitched) {
    await sendSectionMessage(userId, section, t, config.bot.token, config.bot.webappUrl).catch(
      (reason) => logger.warn(reason, "Could not send section switch message"),
    );
  }

  const defaultDuration =
    section === "video"
      ? ((modelSettings.duration as number | undefined) ??
        model.supportedDurations?.[0] ??
        model.durationRange?.min ??
        5)
      : undefined;

  const costLine = buildActivationCostLine(model, modelSettings, t, defaultDuration);

  const audioHints: Record<string, string> = {
    "tts-openai": t.audio.ttsActivated,
    "tts-el": t.audio.ttsElActivated,
    "voice-clone": t.audio.voiceCloneActivated,
    suno: t.audio.musicActivated,
    "music-el": t.audio.musicElActivated,
    "sounds-el": t.audio.soundsActivated,
  };
  const videoHints: Record<string, string> = {
    heygen: t.video.hintHeygen,
    higgsfield: t.video.hintHiggsfield,
    "higgsfield-lite": t.video.hintHiggsfield,
    "higgsfield-preview": t.video.hintHiggsfield,
    "d-id": t.video.hintDid,
  };

  const lang = (user?.language ?? "en") as string;
  const { name: modelName, description: modelDesc } = resolveModelDisplay(modelId, lang, model);
  const webappUrl = config.bot.webappUrl;

  // ── Audio section: mirror handleAudioSubSection — single message, no hint split ──
  if (section === "audio") {
    const audioHint = audioHints[modelId] ?? t.audio.activated;
    if (modelId === "voice-clone") {
      // voice-clone: plain label + hint, no inline kb
      await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: String(userId),
          text: `${t.audio.voiceClone}\n\n${audioHint}`,
        }),
      }).catch((reason) => logger.warn(reason, `Could not send activated notification`));
      return;
    }
    const audioText = `${modelName}\n\n${modelDesc}\n\n${audioHint}\n${t.voice.inputHint}\n\n${costLine}`;
    const audioReplyMarkup = webappUrl
      ? {
          inline_keyboard: [
            [
              {
                text: t.audio.management,
                web_app: { url: `${webappUrl}?page=management&section=audio` },
              },
            ],
          ],
        }
      : undefined;
    await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(userId),
        text: audioText,
        ...(audioReplyMarkup ? { reply_markup: audioReplyMarkup } : {}),
      }),
    }).catch((reason) => logger.warn(reason, `Could not send activated notification`));
    return;
  }

  const hint = section === "video" ? (videoHints[modelId] ?? t.video.hintVideoDefault) : undefined;

  const text = `${modelName}\n\n${modelDesc}\n\n${costLine}`;

  // Build the unified inline keyboard: media input slots (if any) + management.
  // Model activation clears media inputs, so all slots start empty.
  const inlineKeyboard: { text: string; callback_data?: string; web_app?: { url: string } }[][] =
    [];
  if ((section === "video" || section === "design") && model.mediaInputs?.length) {
    // Progressive reveal: show all non-element slots + only the first element slot.
    // Activation clears media inputs, so all slots start empty.
    let firstElementShown = false;
    for (const slot of model.mediaInputs) {
      if (slot.mode === "reference_element") {
        if (firstElementShown) continue;
        firstElementShown = true;
      }
      const label = (t.mediaInput as Record<string, string>)[slot.labelKey] ?? slot.labelKey;
      const suffix = slot.required ? ` ${t.mediaInput.required}` : ` ${t.mediaInput.optional}`;
      inlineKeyboard.push([
        { text: `${label}${suffix}`, callback_data: `mi:${section}:${slot.slotKey}` },
      ]);
    }
  }
  if (webappUrl) {
    inlineKeyboard.push([
      {
        text: t.common.management,
        web_app: { url: `${webappUrl}?page=management&section=${section}` },
      },
    ]);
  }
  const replyMarkup = inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined;

  // Send description first (no inline kb — it goes on the final message).
  // If there's a hint, send it after the description with the inline kb.
  // If there's no hint, attach the inline kb to the description.
  await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(userId),
      text,
      ...(hint ? {} : replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  }).catch((reason) => logger.warn(reason, `Could not send activated notification`));

  if (hint) {
    await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(userId),
        text: hint,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    }).catch((reason) => logger.warn(reason, `Could not send model hint`));
  }
}

export const stateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /state — current bot state with per-section active dialogs */
  fastify.get("/state", async (request) => {
    const { userId } = request as AuthRequest;
    const state = await userStateService.get(userId);

    return {
      state: state?.state ?? "IDLE",
      section: state?.section ?? null,
      gptModelId: state?.gptModelId ?? null,
      gptDialogId: state?.gptDialogId ?? null,
      designDialogId: state?.designDialogId ?? null,
      audioDialogId: state?.audioDialogId ?? null,
      videoDialogId: state?.videoDialogId ?? null,
      designModelId: state?.designModelId ?? null,
      audioModelId: state?.audioModelId ?? null,
      videoModelId: state?.videoModelId ?? null,
    };
  });

  /** PATCH /state — update gptModelId, per-section dialogId, or per-section modelId */
  fastify.patch<{
    Body: {
      gptModelId?: string;
      section?: string;
      dialogId?: string | null;
      sectionModelId?: string;
    };
  }>("/state", async (request) => {
    const { userId } = request as AuthRequest;
    const { gptModelId, section, dialogId, sectionModelId } = request.body;

    if (gptModelId !== undefined) {
      await userStateService.setGptModel(userId, gptModelId);
    }
    if (section !== undefined && dialogId !== undefined) {
      await userStateService.setDialogForSection(userId, section as Section, dialogId);
    }
    if (section !== undefined && sectionModelId !== undefined) {
      await userStateService.setModelForSection(
        userId,
        section as "design" | "audio" | "video",
        sectionModelId,
      );
    }

    return { success: true };
  });

  /** POST /state/activate — set model for section and send Telegram notification */
  fastify.post<{
    Body: { section: string; modelId: string };
  }>("/state/activate", async (request) => {
    const { userId } = request as AuthRequest;
    const { section, modelId } = request.body;

    await userStateService.setModelForSection(
      userId,
      section as "design" | "audio" | "video",
      modelId,
    );

    // Synchronously switch the bot state + section so the very next user message
    // is routed to the newly-activated section (avoids a race with the async
    // notification send). sendModelActivatedNotification will only send the
    // optional section-switch keyboard message.
    const newState =
      section === "audio"
        ? "AUDIO_ACTIVE"
        : section === "design"
          ? "DESIGN_ACTIVE"
          : section === "video"
            ? "VIDEO_ACTIVE"
            : undefined;

    let sectionSwitched = false;
    if (newState) {
      const prev = await userStateService.get(userId);
      if (prev?.section !== section) {
        sectionSwitched = true;
        await userStateService.setState(
          userId,
          newState as Parameters<typeof userStateService.setState>[1],
          section as Section,
        );
      }
    }

    await sendModelActivatedNotification(userId, section, modelId, sectionSwitched);

    return { success: true };
  });
};
