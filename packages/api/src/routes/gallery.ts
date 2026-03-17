import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { getFileUrl } from "../services/s3.service.js";
import { config } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

const SECTION_SEND_METHOD: Record<string, string> = {
  image: "sendPhoto",
  audio: "sendAudio",
  video: "sendVideo",
};

async function sendFileToUser(
  userId: bigint,
  section: string,
  fileUrl: string,
  caption: string,
): Promise<void> {
  const method = SECTION_SEND_METHOD[section] ?? "sendDocument";
  const paramKey = section === "image" ? "photo" : section === "audio" ? "audio" : "video";

  const body: Record<string, unknown> = {
    chat_id: userId.toString(),
    [paramKey]: fileUrl,
    caption,
  };

  const res = await fetch(
    `https://api.telegram.org/bot${config.bot.token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { description?: string };
    throw new Error(`Telegram API error: ${err.description ?? res.status}`);
  }
}

export const galleryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /**
   * GET /gallery?section=image|audio|video&page=1&limit=20
   * Returns the current user's completed generation jobs, newest first.
   */
  fastify.get<{
    Querystring: { section?: string; page?: string; limit?: string };
  }>("/gallery", async (request) => {
    const userId = (request as AuthRequest).userId;
    const { section, page = "1", limit = "20" } = request.query;

    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = {
      userId,
      status: "done",
      ...(section ? { section } : {}),
    };

    const [items, total] = await Promise.all([
      db.generationJob.findMany({
        where,
        orderBy: { completedAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          section: true,
          modelId: true,
          prompt: true,
          s3Key: true,
          outputUrl: true,
          completedAt: true,
        },
      }),
      db.generationJob.count({ where }),
    ]);

    return { items, total, page: parseInt(page, 10), limit: take };
  });

  /**
   * POST /gallery/:id/download
   * Sends the file to the user's Telegram chat.
   */
  fastify.post<{ Params: { id: string } }>("/gallery/:id/download", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const job = await db.generationJob.findUnique({
      where: { id },
      select: { id: true, userId: true, section: true, modelId: true, prompt: true, s3Key: true, outputUrl: true },
    });

    if (!job) return reply.code(404).send({ error: "Not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    // Resolve file URL: prefer S3, fall back to provider URL
    let fileUrl: string | null = null;

    if (job.s3Key) {
      fileUrl = await getFileUrl(job.s3Key);
    }

    if (!fileUrl && job.outputUrl) {
      fileUrl = job.outputUrl;
    }

    if (!fileUrl) {
      return reply.code(422).send({ error: "File not available" });
    }

    const caption = `${job.modelId}: ${job.prompt.slice(0, 200)}`;
    await sendFileToUser(userId, job.section, fileUrl, caption);

    return { success: true };
  });
};
