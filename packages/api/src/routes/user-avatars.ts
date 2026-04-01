import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userAvatarService } from "../services/user-avatar.service.js";
import { userStateService } from "../services/user-state.service.js";
import { getFileUrl } from "../services/s3.service.js";
import { config } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

export const userAvatarsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /user-avatars?provider=heygen — list user avatars */
  fastify.get<{ Querystring: { provider?: string } }>("/user-avatars", async (request) => {
    const { userId } = request as AuthRequest;
    const { provider } = request.query;
    const avatars = await userAvatarService.list(userId, provider);
    return Promise.all(
      avatars.map(async (a) => {
        let previewUrl = a.previewUrl;
        if (previewUrl && !previewUrl.startsWith("http")) {
          previewUrl = await getFileUrl(previewUrl).catch(() => null);
        }
        return {
          id: a.id,
          provider: a.provider,
          name: a.name,
          externalId: a.externalId,
          previewUrl,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
        };
      }),
    );
  });

  /**
   * POST /user-avatars/start-creation
   * Sets the bot FSM state to HEYGEN_AVATAR_PHOTO and sends a Telegram prompt.
   */
  fastify.post<{ Body: { provider: string } }>(
    "/user-avatars/start-creation",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { provider } = request.body ?? {};

      if (!provider) return reply.status(400).send({ error: "provider is required" });

      // Only HeyGen is supported currently
      if (provider !== "heygen") {
        return reply.status(400).send({ error: `Unsupported provider: ${provider}` });
      }

      // Set bot FSM state so the next photo from the user triggers avatar creation
      await userStateService.setState(userId, "HEYGEN_AVATAR_PHOTO", "video");

      // Send Telegram message asking for a photo
      const telegramChatId = Number(userId);
      await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: "📸 Отправьте фото, из которого хотите сделать аватар.",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Отмена", callback_data: "heygen_avatar_cancel" }]],
          },
        }),
      });

      return { ok: true };
    },
  );

  /** PATCH /user-avatars/:id — rename */
  fastify.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/user-avatars/:id",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { id } = request.params;
      const { name } = request.body;
      if (!name?.trim()) return reply.status(400).send({ error: "name is required" });
      const updated = await userAvatarService.rename(id, userId, name.trim());
      if (!updated) return reply.status(404).send({ error: "Avatar not found" });
      return { ok: true };
    },
  );

  /** DELETE /user-avatars/:id */
  fastify.delete<{ Params: { id: string } }>("/user-avatars/:id", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { id } = request.params;
    const ok = await userAvatarService.delete(id, userId);
    if (!ok) return reply.status(404).send({ error: "Avatar not found" });
    return { ok: true };
  });
};
