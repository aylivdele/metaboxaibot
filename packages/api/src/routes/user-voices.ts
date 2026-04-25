import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { getFileUrl } from "../services/s3.service.js";
import { acquireById } from "../services/key-pool.service.js";
import { ElevenLabsAdapter } from "../ai/audio/elevenlabs.adapter.js";
import { logger } from "../logger.js";

type AuthRequest = FastifyRequest & { userId: bigint };

export const userVoicesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /user-voices?provider=elevenlabs — list user voices */
  fastify.get<{ Querystring: { provider?: string } }>("/user-voices", async (request) => {
    const { userId } = request as AuthRequest;
    const { provider } = request.query;
    const voices = await db.userVoice.findMany({
      where: { userId, ...(provider ? { provider } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return voices.map((v) => ({
      id: v.id,
      provider: v.provider,
      name: v.name,
      externalId: v.externalId,
      previewUrl: v.previewUrl,
      hasAudio: v.previewUrl !== null || v.audioS3Key !== null,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
    }));
  });

  /**
   * GET /user-voices/:id/preview-url — resolve a playable URL on demand.
   * Prefers ElevenLabs-hosted preview; otherwise mints a fresh presigned URL
   * for the original recording in S3 (no public bucket).
   */
  fastify.get<{ Params: { id: string } }>(
    "/user-voices/:id/preview-url",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { id } = request.params;
      const voice = await db.userVoice.findFirst({
        where: { id, userId },
        select: { previewUrl: true, audioS3Key: true },
      });
      if (!voice) return reply.status(404).send({ error: "Voice not found" });
      if (voice.previewUrl) return { url: voice.previewUrl };
      if (voice.audioS3Key) {
        const url = await getFileUrl(voice.audioS3Key).catch(() => null);
        if (url) return { url };
      }
      return reply.status(404).send({ error: "No preview available" });
    },
  );

  /** PATCH /user-voices/:id — rename */
  fastify.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/user-voices/:id",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { id } = request.params;
      const { name } = request.body;
      if (!name?.trim()) return reply.status(400).send({ error: "name is required" });

      const voice = await db.userVoice.findFirst({ where: { id, userId } });
      if (!voice) return reply.status(404).send({ error: "Voice not found" });

      const updated = await db.userVoice.update({
        where: { id },
        data: { name: name.trim() },
      });
      return {
        id: updated.id,
        provider: updated.provider,
        name: updated.name,
        externalId: updated.externalId,
        previewUrl: updated.previewUrl,
        hasAudio: updated.previewUrl !== null || updated.audioS3Key !== null,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      };
    },
  );

  /** DELETE /user-voices/:id — delete from DB and from ElevenLabs */
  fastify.delete<{ Params: { id: string } }>("/user-voices/:id", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { id } = request.params;

    const voice = await db.userVoice.findFirst({ where: { id, userId } });
    if (!voice) return reply.status(404).send({ error: "Voice not found" });

    // Delete from ElevenLabs on the SAME key the voice was created on — voice_id
    // живёт per-account, env-ключ может его не видеть. Если ключ уже удалён из
    // пула — acquireById fallback'ается на env (best-effort). Failure не блокирует
    // удаление из БД.
    if (voice.externalId) {
      try {
        const acquired = await acquireById(voice.providerKeyId, "elevenlabs");
        await ElevenLabsAdapter.deleteVoice(voice.externalId, acquired.apiKey);
      } catch (err) {
        logger.warn(
          { voiceId: voice.id, externalId: voice.externalId, err },
          "user-voices DELETE: ElevenLabs cleanup failed (continuing with DB delete)",
        );
      }
    }

    await db.userVoice.delete({ where: { id } });
    return { success: true };
  });
};
