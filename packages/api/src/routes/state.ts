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
      modelId: state?.modelId ?? null,
      gptDialogId: state?.gptDialogId ?? null,
      designDialogId: state?.designDialogId ?? null,
      audioDialogId: state?.audioDialogId ?? null,
      videoDialogId: state?.videoDialogId ?? null,
    };
  });

  /** PATCH /state — update modelId or per-section dialogId */
  fastify.patch<{ Body: { modelId?: string; section?: string; dialogId?: string | null } }>(
    "/state",
    async (request) => {
      const { userId } = request as AuthRequest;
      const { modelId, section, dialogId } = request.body;

      if (modelId !== undefined) {
        await userStateService.setModel(userId, modelId);
      }
      if (section !== undefined && dialogId !== undefined) {
        await userStateService.setDialogForSection(userId, section as Section, dialogId);
      }

      return { success: true };
    },
  );
};
