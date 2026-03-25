import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userStateService } from "../services/user-state.service.js";
import { calculateCost } from "../services/token.service.js";
import { db } from "../db.js";
import { AI_MODELS, config, getT, type Section } from "@metabox/shared";
import type { Language } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

const SECTION_EMOJI: Record<string, string> = {
  design: "🎨",
  video: "🎬",
  audio: "🎵",
};

async function sendModelActivatedNotification(
  userId: bigint,
  section: string,
  modelId: string,
): Promise<void> {
  const model = AI_MODELS[modelId];
  if (!model || !config.bot.token) return;

  const user = await db.user.findUnique({ where: { id: userId }, select: { language: true } });
  const t = getT((user?.language ?? "en") as Language);
  const cost = calculateCost(model);
  const costLine = t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
  const emoji = SECTION_EMOJI[section] ?? "🤖";
  const text = `${emoji} ${model.name}\n\n${model.description}\n\n${costLine}`;

  await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(userId), text }),
  }).catch(() => void 0);
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

    void sendModelActivatedNotification(userId, section, modelId);

    return { success: true };
  });
};
