import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { userUploadsService } from "../services/user-uploads.service.js";

type AuthRequest = FastifyRequest & { userId: bigint };

export const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /uploads?type=voice — list user uploads, optionally filtered by type */
  fastify.get<{ Querystring: { type?: string } }>("/uploads", async (request) => {
    const { userId } = request as AuthRequest;
    const uploads = await userUploadsService.list(userId);
    const { type } = request.query;
    return type ? uploads.filter((u) => u.type === type) : uploads;
  });

  /** PATCH /uploads/:id — rename */
  fastify.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/uploads/:id",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { id } = request.params;
      const { name } = request.body;
      if (!name?.trim()) {
        return reply.status(400).send({ error: "name is required" });
      }
      const updated = await userUploadsService.rename(id, userId, name.trim());
      if (!updated) return reply.status(404).send({ error: "Upload not found" });
      return updated;
    },
  );

  /** DELETE /uploads/:id */
  fastify.delete<{ Params: { id: string } }>("/uploads/:id", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { id } = request.params;
    const ok = await userUploadsService.delete(id, userId);
    if (!ok) return reply.status(404).send({ error: "Upload not found" });
    return { success: true };
  });
};
