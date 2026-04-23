import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { getFileUrl, deleteFile } from "../services/s3.service.js";
import { generateDownloadToken } from "../utils/download-token.js";
import { AI_MODELS, config, getT } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

// Telegram URL-fetch limits when the bot sends a remote URL to the Bot API:
// images go through sendPhoto (5 MB), other media + documents use 20 MB.
const PHOTO_URL_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_URL_MAX_BYTES = 20 * 1024 * 1024;

type TelegramSendMethod = "sendPhoto" | "sendVideo" | "sendAudio" | "sendDocument";

function sectionToMethod(section: string): TelegramSendMethod {
  if (section === "image") return "sendPhoto";
  if (section === "video") return "sendVideo";
  if (section === "audio") return "sendAudio";
  return "sendDocument";
}

function methodParamKey(method: TelegramSendMethod): "photo" | "video" | "audio" | "document" {
  if (method === "sendPhoto") return "photo";
  if (method === "sendVideo") return "video";
  if (method === "sendAudio") return "audio";
  return "document";
}

/** Probe Content-Length via HEAD. Returns null on any failure (network, 4xx, missing header). */
async function probeFileSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    if (!len) return null;
    const n = parseInt(len, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function sendFileToUser(
  userId: bigint,
  method: TelegramSendMethod,
  fileUrl: string,
  caption: string,
  replyMarkup?: object,
): Promise<void> {
  const paramKey = methodParamKey(method);

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
   * Outputs of a single job are grouped under one entry so the UI can render
   * a multi-image card per request.
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
          inputData: true,
          tokensSpent: true,
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
    const items = rawJobs.map((job) => {
      const model = AI_MODELS[job.modelId];
      const inputData = (job.inputData ?? {}) as Record<string, unknown>;
      const modelSettings = (inputData.modelSettings as Record<string, unknown> | undefined) ?? {};

      const outputs = job.outputs.map((output) => {
        const previewUrl =
          job.section !== "design" && output.s3Key && base
            ? `${base}/download/${generateDownloadToken(output.s3Key, userId)}`
            : output.outputUrl;
        const thumbnailUrl =
          output.thumbnailS3Key && base
            ? `${base}/download/${generateDownloadToken(output.thumbnailS3Key, userId)}`
            : null;
        return {
          id: output.id,
          s3Key: output.s3Key,
          outputUrl: output.outputUrl,
          previewUrl,
          thumbnailUrl,
        };
      });

      return {
        id: job.id,
        section: job.section,
        modelId: job.modelId,
        modelName: model?.name ?? job.modelId,
        prompt: job.prompt,
        modelSettings,
        tokensSpent: job.tokensSpent ? job.tokensSpent.toString() : null,
        completedAt: job.completedAt,
        outputs,
      };
    });

    return { items, total, page: parseInt(page, 10), limit: take };
  });

  /**
   * POST /gallery/jobs/:id/send
   * Re-delivers all outputs of a generation job to the user's Telegram chat,
   * mirroring the worker's "job completed" payload:
   *   • Image batches (>1 output): one sendMediaGroup with caption on the first
   *     item, followed by a single sendMessage with per-output inline buttons.
   *   • Single output (any section) and non-image batches: per-output flow with
   *     section-appropriate send method + per-output button.
   *
   * Per-output button selection (matches worker `image.processor.ts`):
   *   • size ≤ 50 MB or unknown → callback `orig_<outputId>` ("📎 Отправить оригинал")
   *   • size > 50 MB           → URL `/download/<token>` ("⬇️ Скачать")
   * Files > 20 MB without an S3 key are unreachable and skipped silently.
   */
  fastify.post<{ Params: { id: string } }>("/gallery/jobs/:id/send", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const job = await db.generationJob.findUnique({
      where: { id },
      select: {
        userId: true,
        section: true,
        modelId: true,
        prompt: true,
        outputs: {
          orderBy: { index: "asc" },
          select: { id: true, s3Key: true, outputUrl: true },
        },
      },
    });

    if (!job) return reply.code(404).send({ error: "Not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
    if (job.outputs.length === 0) return reply.code(422).send({ error: "No outputs" });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const t = getT((user?.language ?? "ru") as Parameters<typeof getT>[0]);

    // Telegram bot multipart-upload ceiling — what the bot's `orig_` handler
    // can re-deliver as a document. Above this we have to fall back to a
    // browser download link.
    const TELEGRAM_DOC_MAX_BYTES = 50 * 1024 * 1024;

    type ResolvedOutput = {
      id: string;
      s3Key: string | null;
      url: string;
      size: number | null;
    };

    const resolved: ResolvedOutput[] = [];
    for (const out of job.outputs) {
      let url: string | null = null;
      if (out.s3Key) url = await getFileUrl(out.s3Key);
      if (!url) url = out.outputUrl;
      if (!url) continue;
      const size = await probeFileSize(url);
      resolved.push({ id: out.id, s3Key: out.s3Key, url, size });
    }
    if (resolved.length === 0) return reply.code(422).send({ error: "No deliverable outputs" });

    const caption = `${job.modelId}: ${job.prompt.slice(0, 200)}`;
    const botUrl = `https://api.telegram.org/bot${config.bot.token}`;

    type InlineButton = { text: string; callback_data?: string; url?: string };

    const buildPerOutputButton = (out: ResolvedOutput, n: number): InlineButton | null => {
      if (out.size === null || out.size <= TELEGRAM_DOC_MAX_BYTES) {
        return { text: `${n}. 📎`, callback_data: `orig_${out.id}` };
      }
      if (out.s3Key && config.api.publicUrl) {
        return {
          text: `${n}. ⬇️`,
          url: `${config.api.publicUrl}/download/${generateDownloadToken(out.s3Key, userId)}`,
        };
      }
      return null;
    };

    // ── Image batch: media group + per-output button row ───────────────────
    if (job.section === "image" && resolved.length > 1) {
      const mediaGroup = resolved.map((out, i) => ({
        type: "photo" as const,
        media: out.url,
        ...(i === 0 ? { caption } : {}),
      }));

      let groupOk = false;
      try {
        const res = await fetch(`${botUrl}/sendMediaGroup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: userId.toString(), media: mediaGroup }),
        });
        groupOk = res.ok;
      } catch {
        // network error — fall through to per-output retry below
      }

      if (!groupOk) {
        // Telegram rejected the group (likely a photo > 5 MB URL limit). Fall
        // back to sending each one individually as a document so the user
        // still gets every file. Caption goes only on the first message.
        // Per-output failures are swallowed so one bad file doesn't block the
        // rest of the batch — the follow-up button row gives the user another
        // way to fetch them.
        for (let i = 0; i < resolved.length; i++) {
          const out = resolved[i];
          await sendFileToUser(userId, "sendDocument", out.url, i === 0 ? caption : "").catch(
            () => void 0,
          );
        }
      }

      const buttons = resolved
        .map((out, i) => buildPerOutputButton(out, i + 1))
        .filter((b): b is InlineButton => b !== null);

      if (buttons.length > 0) {
        // Layout matches worker: ≤3 outputs → 1 button per row, more → 2 per row.
        const perRow = resolved.length <= 3 ? 1 : 2;
        const rows: InlineButton[][] = [];
        for (let i = 0; i < buttons.length; i += perRow) {
          rows.push(buttons.slice(i, i + perRow));
        }
        await fetch(`${botUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: userId.toString(),
            text: t.design.batchActions,
            reply_markup: { inline_keyboard: rows },
          }),
        });
      }

      return { success: true };
    }

    // ── Single output OR non-image batch (rare) ─────────────────────────────
    // Per-output flow with two-button selection on the file message itself.
    for (let i = 0; i < resolved.length; i++) {
      const out = resolved[i];
      const isFirst = i === 0;
      const sectionMethod = sectionToMethod(job.section);
      const sectionLimit =
        sectionMethod === "sendPhoto" ? PHOTO_URL_MAX_BYTES : MEDIA_URL_MAX_BYTES;
      const button = buildPerOutputButton(out, i + 1);
      const replyMarkup = button ? { inline_keyboard: [[button]] } : undefined;
      const downloadMarkup =
        out.s3Key && config.api.publicUrl
          ? {
              inline_keyboard: [
                [
                  {
                    text: t.common.downloadFile,
                    url: `${config.api.publicUrl}/download/${generateDownloadToken(out.s3Key, userId)}`,
                  },
                ],
              ],
            }
          : undefined;

      const tooLargeForDocument = out.size !== null && out.size > MEDIA_URL_MAX_BYTES;
      const tooLargeForSectionMethod =
        out.size !== null && out.size > sectionLimit && out.size <= MEDIA_URL_MAX_BYTES;

      if (tooLargeForDocument) {
        await fetch(`${botUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: userId.toString(),
            text: `${isFirst ? caption : ""}\n\n${t.errors.fileTooLargeForTelegram}`,
            ...(downloadMarkup ? { reply_markup: downloadMarkup } : {}),
          }),
        });
        continue;
      }

      try {
        if (tooLargeForSectionMethod) {
          // Document by URL fits; no per-output button needed — file is already
          // the uncompressed original.
          await sendFileToUser(userId, "sendDocument", out.url, isFirst ? caption : "");
        } else {
          await sendFileToUser(userId, sectionMethod, out.url, isFirst ? caption : "", replyMarkup);
        }
      } catch (err) {
        const isTooLarge =
          err instanceof Error &&
          (err.message.includes("Request Entity Too Large") ||
            err.message.includes("file is too big") ||
            err.message.includes("wrong file identifier"));

        if (isTooLarge) {
          await fetch(`${botUrl}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: userId.toString(),
              text: `${isFirst ? caption : ""}\n\n${t.errors.fileTooLargeForTelegram}`,
              ...(downloadMarkup ? { reply_markup: downloadMarkup } : {}),
            }),
          });
        } else {
          throw err;
        }
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
   * GET /gallery/outputs/:id/original-url
   * Returns a presigned S3 URL with attachment-disposition so the browser
   * downloads the original file instead of opening it inline. Falls back
   * to the provider URL when the file is not in S3.
   */
  fastify.get<{ Params: { id: string } }>(
    "/gallery/outputs/:id/original-url",
    async (request, reply) => {
      const userId = (request as AuthRequest).userId;
      const { id } = request.params;

      const output = await db.generationJobOutput.findUnique({
        where: { id },
        include: { job: { select: { userId: true } } },
      });

      if (!output) return reply.code(404).send({ error: "Not found" });
      if (output.job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

      let url: string | null = null;
      if (output.s3Key) {
        const filename = output.s3Key.split("/").pop() ?? "file";
        url = await getFileUrl(output.s3Key, filename);
      }
      if (!url) url = output.outputUrl;

      if (!url) return reply.code(422).send({ error: "File not available" });
      return { url };
    },
  );

  /**
   * DELETE /gallery/jobs/:id
   * Removes the entire generation job — all its outputs and S3 artifacts.
   */
  fastify.delete<{ Params: { id: string } }>("/gallery/jobs/:id", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params;

    const job = await db.generationJob.findUnique({
      where: { id },
      select: {
        userId: true,
        outputs: { select: { s3Key: true, thumbnailS3Key: true } },
      },
    });

    if (!job) return reply.code(404).send({ error: "Not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await Promise.all(
      job.outputs.flatMap((o) => [
        o.s3Key ? deleteFile(o.s3Key) : Promise.resolve(),
        o.thumbnailS3Key ? deleteFile(o.thumbnailS3Key) : Promise.resolve(),
      ]),
    );

    // outputs cascade-delete via the FK on GenerationJobOutput
    await db.generationJob.delete({ where: { id } });

    return { success: true };
  });
};
