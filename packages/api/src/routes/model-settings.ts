import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userStateService } from "../services/user-state.service.js";

type AuthRequest = FastifyRequest & { userId: bigint };

export const modelSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /model-settings — returns { [modelId]: { [key]: value } } */
  fastify.get("/model-settings", async (request) => {
    const { userId } = request as AuthRequest;
    return userStateService.getModelSettings(userId);
  });

  /** PATCH /model-settings — merge settings for a specific model */
  fastify.patch<{ Body: { modelId: string; settings: Record<string, unknown> } }>(
    "/model-settings",
    async (request) => {
      const { userId } = request as AuthRequest;
      const { modelId, settings } = request.body;
      if (!modelId || typeof settings !== "object" || settings === null) {
        throw { statusCode: 400, message: "modelId and settings object are required" };
      }
      request.log.info({ userId: userId.toString(), modelId, settings }, "[model-settings] PATCH");
      await userStateService.setModelSettings(userId, modelId, settings);
      return { success: true };
    },
  );
};
