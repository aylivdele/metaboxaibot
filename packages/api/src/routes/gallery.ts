import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { getFileUrl, deleteFile } from "../services/s3.service.js";
import { generateDownloadToken } from "../utils/download-token.js";
import { config, getT } from "@metabox/shared";

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
  replyMarkup?: object,
): Promise<void> {
  const method = SECTION_SEND_METHOD[section] ?? "sendDocument";
  const paramKey = section === "image" ? "photo" : section === "audio" ? "audio" : "video";

  const body: Record<string, unknown> = {
    chat_id: userId.toString(),
    [paramKey]: fileUrl,
    caption,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  const res = await fetch(`https://api.telegram.org/bot${config.bot.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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

    const [rawItems, total] = await Promise.all([
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
          thumbnailS3Key: true,
          outputUrl: true,
          completedAt: true,
        },
      }),
      db.generationJob.count({ where }),
    ]);

    // Resolve stable URLs for each item via signed download tokens.
    // thumbnailUrl: thumbnail WebP when available, else null.
    // previewUrl: full-res file — S3 token when available, else provider URL.
    //   Videos skip this resolution to keep list payloads light; callers fetch
    //   the URL on-demand via GET /gallery/:id/preview-url when the user opens
    //   the player.
    const items = rawItems.map((item) => {
      const base = config.api.publicUrl;
      const previewUrl =
        item.section === "video"
          ? null
          : item.s3Key && base
            ? `${base}/download/${generateDownloadToken(item.s3Key, userId)}`
            : item.outputUrl;
      const thumbnailUrl =
        item.thumbnailS3Key && base
          ? `${base}/download/${generateDownloadToken(item.thumbnailS3Key, userId)}`
          : null;
      return { ...item, previewUrl, thumbnailUrl };
    });

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
      select: {
        id: true,
        userId: true,
        section: true,
        modelId: true,
        prompt: true,
        s3Key: true,
        outputUrl: true,
      },
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

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const t = getT((user?.language ?? "ru") as Parameters<typeof getT>[0]);

    const downloadMarkup =
      job.s3Key && config.api.publicUrl
        ? {
            inline_keyboard: [
              [
                {
                  text: t.common.downloadFile,
                  url: `${config.api.publicUrl}/download/${generateDownloadToken(job.s3Key, userId)}`,
                },
              ],
            ],
          }
        : undefined;

    try {
      await sendFileToUser(userId, job.section, fileUrl, caption, downloadMarkup);
    } catch (err) {
      // If Telegram rejected the file (e.g. too large), send a download link instead
      const isTooLarge =
        err instanceof Error &&
        (err.message.includes("Request Entity Too Large") ||
          err.message.includes("file is too big") ||
          err.message.includes("wrong file identifier"));

      if (isTooLarge && downloadMarkup) {
        await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: userId.toString(),
            text: `${caption}\n\n${t.errors.fileTooLargeForTelegram}`,
            reply_markup: downloadMarkup,
          }),
        });
      } else {
        throw err;
      }
    }

    return { success: true };
  });

  /**
   * GET /gallery/:id/preview-url
   * Returns a playable URL for the gallery item on demand. Used primarily by
   * the webapp video player modal — list responses no longer include
   * previewUrl for videos to keep payloads small. Falls back to the raw
   * provider outputUrl when no S3 key is available.
   */
  fastify.get<{ Params: { id: string } }>("/gallery/:id/preview-url", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const job = await db.generationJob.findUnique({
      where: { id },
      select: { id: true, userId: true, s3Key: true, outputUrl: true },
    });

    if (!job) return reply.code(404).send({ error: "Not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const base = config.api.publicUrl;
    const url =
      job.s3Key && base
        ? `${base}/download/${generateDownloadToken(job.s3Key, userId)}`
        : job.outputUrl;

    if (!url) return reply.code(422).send({ error: "File not available" });
    return { url };
  });

  /**
   * DELETE /gallery/:id
   * Removes a gallery item (completed generation job) along with its S3
   * artifacts (main file + thumbnail, if any). The DB row is deleted only
   * after S3 cleanup is attempted — failures in S3 are logged via the
   * boolean return but do not block the DB delete (the user's intent is to
   * remove the item from their gallery).
   */
  fastify.delete<{ Params: { id: string } }>("/gallery/:id", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const job = await db.generationJob.findUnique({
      where: { id },
      select: { id: true, userId: true, s3Key: true, thumbnailS3Key: true },
    });

    if (!job) return reply.code(404).send({ error: "Not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    if (job.s3Key) await deleteFile(job.s3Key);
    if (job.thumbnailS3Key) await deleteFile(job.thumbnailS3Key);

    await db.generationJob.delete({ where: { id } });

    return { success: true };
  });
};
