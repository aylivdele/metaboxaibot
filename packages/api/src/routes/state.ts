import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userStateService } from "../services/user-state.service.js";

type AuthRequest = FastifyRequest & { userId: bigint };

export const stateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /state — current bot state (model, dialog) */
  fastify.get("/state", async (request) => {
    const { userId } = request as AuthRequest;
    const state = await userStateService.get(userId);

    return {
      state: state?.state ?? "IDLE",
      section: state?.section ?? null,
      modelId: state?.modelId ?? null,
      dialogId: state?.dialogId ?? null,
    };
  });

  /** PATCH /state — update modelId or dialogId */
  fastify.patch<{ Body: { modelId?: string; dialogId?: string | null } }>(
    "/state",
    async (request) => {
      const { userId } = request as AuthRequest;
      const { modelId, dialogId } = request.body;

      if (modelId !== undefined) {
        await userStateService.setModel(userId, modelId);
      }
      if (dialogId !== undefined) {
        await userStateService.setDialog(userId, dialogId);
      }

      return { success: true };
    },
  );
};
