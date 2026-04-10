import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userStateService } from "../services/user-state.service.js";
import { calculateCost, computeVideoTokens } from "../services/token.service.js";
import { db } from "../db.js";
import {
  AI_MODELS,
  config,
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
  const isPerSecond = model.costUsdPerSecond !== undefined;
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
      ? computeVideoTokens(model, undefined, defaultDuration)
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
  const makeMgmtBtn = (label: string) =>
    webappUrl
      ? { text: label, web_app: { url: `${webappUrl}?page=management&section=${section}` } }
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
  const hint =
    section === "audio"
      ? (audioHints[modelId] ?? t.audio.activated)
      : section === "video"
        ? (videoHints[modelId] ?? t.video.hintVideoDefault)
        : undefined;

  const lang = (user?.language ?? "en") as string;
  const { name: modelName, description: modelDesc } = resolveModelDisplay(modelId, lang, model);
  const text =
    hint && modelId !== "voice-clone"
      ? `${modelName}\n\n${modelDesc}\n\n${hint}\n\n${costLine}`
      : hint
        ? `${modelName}\n\n${modelDesc}\n\n${hint}`
        : `${modelName}\n\n${modelDesc}\n\n${costLine}`;

  const webappUrl = config.bot.webappUrl;
  const replyMarkup = webappUrl
    ? {
        inline_keyboard: [
          [
            {
              text: t.common.management,
              web_app: { url: `${webappUrl}?page=management&section=${section}` },
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
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  }).catch((reason) => logger.warn(reason, `Could not send activated notification`));
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
