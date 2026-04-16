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
   * Each output within a batch is returned as a separate gallery item.
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

    const [rawJobs, total] = await Promise.all([
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
          completedAt: true,
          outputs: {
            orderBy: { index: "asc" },
            select: {
              id: true,
              s3Key: true,
              thumbnailS3Key: true,
              outputUrl: true,
            },
          },
        },
      }),
      db.generationJob.count({ where }),
    ]);

    const base = config.api.publicUrl;
    const items = rawJobs.flatMap((job) =>
      job.outputs.map((output) => {
        const previewUrl =
          job.section !== "design"
            ? null
            : output.s3Key && base
              ? `${base}/download/${generateDownloadToken(output.s3Key, userId)}`
              : output.outputUrl;
        const thumbnailUrl =
          output.thumbnailS3Key && base
            ? `${base}/download/${generateDownloadToken(output.thumbnailS3Key, userId)}`
            : null;
        return {
          id: output.id,
          section: job.section,
          modelId: job.modelId,
          prompt: job.prompt,
          s3Key: output.s3Key,
          outputUrl: output.outputUrl,
          previewUrl,
          thumbnailUrl,
          completedAt: job.completedAt,
        };
      }),
    );

    return { items, total, page: parseInt(page, 10), limit: take };
  });

  /**
   * POST /gallery/:id/download
   * Sends the file to the user's Telegram chat.
   * :id is a GenerationJobOutput ID.
   */
  fastify.post<{ Params: { id: string } }>("/gallery/:id/download", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const output = await db.generationJobOutput.findUnique({
      where: { id },
      include: {
        job: { select: { userId: true, section: true, modelId: true, prompt: true } },
      },
    });

    if (!output) return reply.code(404).send({ error: "Not found" });
    if (output.job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    // Resolve file URL: prefer S3, fall back to provider URL
    let fileUrl: string | null = null;

    if (output.s3Key) {
      fileUrl = await getFileUrl(output.s3Key);
    }

    if (!fileUrl && output.outputUrl) {
      fileUrl = output.outputUrl;
    }

    if (!fileUrl) {
      return reply.code(422).send({ error: "File not available" });
    }

    const caption = `${output.job.modelId}: ${output.job.prompt.slice(0, 200)}`;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const t = getT((user?.language ?? "ru") as Parameters<typeof getT>[0]);

    const downloadMarkup =
      output.s3Key && config.api.publicUrl
        ? {
            inline_keyboard: [
              [
                {
                  text: t.common.downloadFile,
                  url: `${config.api.publicUrl}/download/${generateDownloadToken(output.s3Key, userId)}`,
                },
              ],
            ],
          }
        : undefined;

    try {
      await sendFileToUser(userId, output.job.section, fileUrl, caption, downloadMarkup);
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
   * Returns a playable URL for the gallery item on demand.
   * :id is a GenerationJobOutput ID.
   */
  fastify.get<{ Params: { id: string } }>("/gallery/:id/preview-url", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const output = await db.generationJobOutput.findUnique({
      where: { id },
      include: { job: { select: { userId: true } } },
    });

    if (!output) return reply.code(404).send({ error: "Not found" });
    if (output.job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const base = config.api.publicUrl;
    const url =
      output.s3Key && base
        ? `${base}/download/${generateDownloadToken(output.s3Key, userId)}`
        : output.outputUrl;

    if (!url) return reply.code(422).send({ error: "File not available" });
    return { url };
  });

  /**
   * DELETE /gallery/:id
   * Removes a gallery output along with its S3 artifacts.
   * If the parent job has no remaining outputs, the job is also deleted.
   */
  fastify.delete<{ Params: { id: string } }>("/gallery/:id", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const output = await db.generationJobOutput.findUnique({
      where: { id },
      include: { job: { select: { userId: true } } },
    });

    if (!output) return reply.code(404).send({ error: "Not found" });
    if (output.job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    if (output.s3Key) await deleteFile(output.s3Key);
    if (output.thumbnailS3Key) await deleteFile(output.thumbnailS3Key);

    await db.generationJobOutput.delete({ where: { id } });

    // Clean up orphaned job
    const remaining = await db.generationJobOutput.count({ where: { jobId: output.jobId } });
    if (remaining === 0) {
      await db.generationJob.delete({ where: { id: output.jobId } });
    }

    return { success: true };
  });
};
