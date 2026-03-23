import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userStateService } from "../services/user-state.service.js";
import type { Section } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

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
};
