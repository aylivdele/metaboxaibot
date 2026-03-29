import type { FastifyInstance } from "fastify";
import { verifyDownloadToken } from "../utils/download-token.js";
import { getFileUrl } from "@metabox/api/services/s3";

export async function downloadRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { token: string } }>(
    "/download/:token",
    { schema: { hide: true } },
    async (request, reply) => {
      const { token } = request.params;

      let payload: { k: string; u: string; e: number };
      try {
        payload = verifyDownloadToken(token);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const presignedUrl = await getFileUrl(payload.k).catch(() => null);
      if (!presignedUrl) {
        return reply.status(404).send({ error: "File not found or S3 not configured" });
      }

      return reply.redirect(302, presignedUrl);
    },
  );
}
