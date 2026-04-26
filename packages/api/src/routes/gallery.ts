import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { getFileUrl, deleteFile } from "../services/s3.service.js";
import { buildDownloadButton, generateDownloadToken } from "../utils/download-token.js";
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
    Querystring: {
      section?: string;
      page?: string;
      limit?: string;
      modelId?: string;
      modelIds?: string;
      folderId?: string;
    };
  }>("/gallery", async (request) => {
    const userId = (request as AuthRequest).userId;
    const { section, page = "1", limit = "20", modelId, modelIds, folderId } = request.query;

    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const modelIdsArray = modelIds ? modelIds.split(",").filter(Boolean) : null;
    const where = {
      userId,
      status: "done",
      ...(section ? { section } : {}),
      ...(modelIdsArray ? { modelId: { in: modelIdsArray } } : modelId ? { modelId } : {}),
      ...(folderId ? { folderItems: { some: { folderId } } } : {}),
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
          folderItems: { select: { folderId: true } },
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
        folderIds: job.folderItems.map((fi) => fi.folderId),
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
    const isImageJob = job.section === "image";

    type InlineButton = {
      text: string;
      callback_data?: string;
      url?: string;
      web_app?: { url: string };
    };

    /**
     * Refine ("🔄 Доработать") — image-only, identical to worker payload.
     * Multi-output cards prefix the label with the index so the user can
     * tell which photo a button belongs to in a batch.
     */
    const buildRefineButton = (out: ResolvedOutput, n: number, multi: boolean): InlineButton => ({
      text: multi ? `${n}. 🔄` : t.design.refine,
      callback_data: `design_ref_${out.id}`,
    });

    /**
     * Action button — orig (callback) when bot can re-upload as document
     * (≤ 50 MB or unknown size), otherwise a direct download URL when the
     * file lives in S3, otherwise null (no way to deliver).
     */
    const buildActionButton = (
      out: ResolvedOutput,
      n: number,
      multi: boolean,
    ): InlineButton | null => {
      if (out.size === null || out.size <= TELEGRAM_DOC_MAX_BYTES) {
        return {
          text: multi ? `${n}. 📎` : t.common.sendOriginal,
          callback_data: `orig_${out.id}`,
        };
      }
      if (out.s3Key) {
        return buildDownloadButton(multi ? `${n}. ⬇️` : t.common.downloadFile, out.s3Key, userId);
      }
      return null;
    };

    // ── Image batch: media group + refine+action pairs follow-up ───────────
    if (isImageJob && resolved.length > 1) {
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

      // Per-output: pair of {refine, action}. Mirrors the worker's batch
      // payload (image.processor.ts) exactly so the user sees identical
      // controls when re-sending an old generation.
      const buttons: InlineButton[] = [];
      for (let i = 0; i < resolved.length; i++) {
        const out = resolved[i];
        const n = i + 1;
        buttons.push(buildRefineButton(out, n, true));
        const action = buildActionButton(out, n, true);
        if (action) buttons.push(action);
      }

      if (buttons.length > 0) {
        // Worker layout: ≤3 outputs → 1 pair/row, even → 2 pairs/row, odd → 3
        // pairs/row. Each pair is 2 buttons (refine + action), so chunkSize
        // doubles the pairs-per-row count.
        const totalPairs = resolved.length;
        const pairsPerRow = totalPairs <= 3 ? 1 : totalPairs % 2 === 0 ? 2 : 3;
        const chunkSize = 2 * pairsPerRow;
        const rows: InlineButton[][] = [];
        for (let i = 0; i < buttons.length; i += chunkSize) {
          rows.push(buttons.slice(i, i + chunkSize));
        }
        // Drop the "⬇️ Скачать" line from the legend when no output produced
        // a download button — happens whenever every photo fits under 50 MB
        // (the common case), so we don't tease a button the user can't see.
        const hasDownloadButton = buttons.some((b) => b.url || b.web_app);
        const hintText = hasDownloadButton
          ? t.design.batchActions
          : t.design.batchActionsNoDownload;
        await fetch(`${botUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: userId.toString(),
            text: hintText,
            reply_markup: { inline_keyboard: rows },
          }),
        });
      }

      return { success: true };
    }

    // ── Single output OR non-image batch (rare) ─────────────────────────────
    // Per-output flow with refine + action stacked on the file message itself
    // (refine is image-only; video/audio just get the action row).
    for (let i = 0; i < resolved.length; i++) {
      const out = resolved[i];
      const isFirst = i === 0;
      const sectionMethod = sectionToMethod(job.section);
      const sectionLimit =
        sectionMethod === "sendPhoto" ? PHOTO_URL_MAX_BYTES : MEDIA_URL_MAX_BYTES;

      const refineRow: InlineButton[] | null = isImageJob
        ? [buildRefineButton(out, i + 1, false)]
        : null;
      const actionBtn = buildActionButton(out, i + 1, false);
      const actionRow: InlineButton[] | null = actionBtn ? [actionBtn] : null;
      const inlineRows = [refineRow, actionRow].filter((r): r is InlineButton[] => r !== null);
      const replyMarkup = inlineRows.length ? { inline_keyboard: inlineRows } : undefined;

      const downloadMarkup = out.s3Key
        ? {
            inline_keyboard: [[buildDownloadButton(t.common.downloadFile, out.s3Key, userId)]],
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
          // Document by URL fits; refine still works on a document for images,
          // so attach the markup even in this branch.
          await sendFileToUser(
            userId,
            "sendDocument",
            out.url,
            isFirst ? caption : "",
            replyMarkup,
          );
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
   * GET /gallery/model-counts?section=image|audio|video
   * Returns per-model generation counts for the current user in a section,
   * ordered by count descending. Only models with at least one job are included.
   */
  fastify.get<{
    Querystring: { section?: string };
  }>("/gallery/model-counts", async (request) => {
    const userId = (request as AuthRequest).userId;
    const { section } = request.query;

    const rows = await db.generationJob.groupBy({
      by: ["modelId"],
      where: {
        userId,
        status: "done",
        ...(section ? { section } : {}),
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    return rows.map((r) => ({ modelId: r.modelId, count: r._count.id }));
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

  // ── Gallery Folders ──────────────────────────────────────────────────────────

  /**
   * GET /gallery/folders
   * Returns all folders for the current user sorted: pinned first, then by name.
   * Includes item count per folder.
   */
  fastify.get("/gallery/folders", async (request) => {
    const userId = (request as AuthRequest).userId;

    const folders = await db.galleryFolder.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
      orderBy: [{ isPinned: "desc" }, { pinnedAt: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    });

    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      isDefault: f.isDefault,
      isPinned: f.isPinned,
      pinnedAt: f.pinnedAt,
      itemCount: f._count.items,
      createdAt: f.createdAt,
    }));
  });

  /**
   * POST /gallery/folders
   * Creates a new user folder.
   */
  fastify.post<{ Body: { name: string } }>("/gallery/folders", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { name } = request.body;

    if (!name || !name.trim()) return reply.code(400).send({ error: "Name is required" });

    const folder = await db.galleryFolder.create({
      data: { userId, name: name.trim() },
    });

    return {
      id: folder.id,
      name: folder.name,
      isDefault: false,
      isPinned: false,
      pinnedAt: null,
      itemCount: 0,
      createdAt: folder.createdAt,
    };
  });

  /**
   * PATCH /gallery/folders/:folderId
   * Rename or pin/unpin a folder. Default folders cannot be renamed.
   */
  fastify.patch<{
    Params: { folderId: string };
    Body: { name?: string; isPinned?: boolean };
  }>("/gallery/folders/:folderId", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { folderId } = request.params;
    const { name, isPinned } = request.body;

    const folder = await db.galleryFolder.findUnique({ where: { id: folderId } });
    if (!folder) return reply.code(404).send({ error: "Not found" });
    if (folder.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
    if (name !== undefined && folder.isDefault)
      return reply.code(400).send({ error: "Cannot rename default folder" });
    if (name !== undefined && !name.trim())
      return reply.code(400).send({ error: "Name is required" });

    const updated = await db.galleryFolder.update({
      where: { id: folderId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(isPinned !== undefined ? { isPinned, pinnedAt: isPinned ? new Date() : null } : {}),
      },
      include: { _count: { select: { items: true } } },
    });

    return {
      id: updated.id,
      name: updated.name,
      isDefault: updated.isDefault,
      isPinned: updated.isPinned,
      pinnedAt: updated.pinnedAt,
      itemCount: updated._count.items,
      createdAt: updated.createdAt,
    };
  });

  /**
   * DELETE /gallery/folders/:folderId
   * Deletes a user folder. Default (Favorites) folders cannot be deleted.
   */
  fastify.delete<{ Params: { folderId: string } }>(
    "/gallery/folders/:folderId",
    async (request, reply) => {
      const userId = (request as AuthRequest).userId;
      const { folderId } = request.params;

      const folder = await db.galleryFolder.findUnique({ where: { id: folderId } });
      if (!folder) return reply.code(404).send({ error: "Not found" });
      if (folder.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
      if (folder.isDefault) return reply.code(400).send({ error: "Cannot delete default folder" });

      await db.galleryFolder.delete({ where: { id: folderId } });
      return { success: true };
    },
  );

  /**
   * POST /gallery/folders/:folderId/items
   * Adds a generation job to a folder.
   */
  fastify.post<{
    Params: { folderId: string };
    Body: { jobId: string };
  }>("/gallery/folders/:folderId/items", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { folderId } = request.params;
    const { jobId } = request.body;

    const folder = await db.galleryFolder.findUnique({ where: { id: folderId } });
    if (!folder) return reply.code(404).send({ error: "Not found" });
    if (folder.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const job = await db.generationJob.findUnique({
      where: { id: jobId },
      select: { userId: true },
    });
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await db.galleryFolderItem.upsert({
      where: { folderId_jobId: { folderId, jobId } },
      create: { folderId, jobId },
      update: {},
    });

    return { success: true };
  });

  /**
   * DELETE /gallery/folders/:folderId/items/:jobId
   * Removes a generation job from a folder.
   */
  fastify.delete<{ Params: { folderId: string; jobId: string } }>(
    "/gallery/folders/:folderId/items/:jobId",
    async (request, reply) => {
      const userId = (request as AuthRequest).userId;
      const { folderId, jobId } = request.params;

      const folder = await db.galleryFolder.findUnique({ where: { id: folderId } });
      if (!folder) return reply.code(404).send({ error: "Not found" });
      if (folder.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

      await db.galleryFolderItem.deleteMany({ where: { folderId, jobId } });
      return { success: true };
    },
  );

  /**
   * POST /gallery/favorites
   * Ensures the Favorites folder exists for the user, then adds the job.
   * Returns the Favorites folder id.
   */
  fastify.post<{ Body: { jobId: string } }>("/gallery/favorites", async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { jobId } = request.body;

    const job = await db.generationJob.findUnique({
      where: { id: jobId },
      select: { userId: true },
    });
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    let favorites = await db.galleryFolder.findFirst({ where: { userId, isDefault: true } });
    if (!favorites) {
      favorites = await db.galleryFolder.create({
        data: { userId, name: "Избранное", isDefault: true },
      });
    }

    await db.galleryFolderItem.upsert({
      where: { folderId_jobId: { folderId: favorites.id, jobId } },
      create: { folderId: favorites.id, jobId },
      update: {},
    });

    return { folderId: favorites.id };
  });

  /**
   * DELETE /gallery/favorites/:jobId
   * Removes a job from the Favorites folder (if it exists).
   */
  fastify.delete<{ Params: { jobId: string } }>(
    "/gallery/favorites/:jobId",
    async (request, reply) => {
      const userId = (request as AuthRequest).userId;
      const { jobId } = request.params;

      const favorites = await db.galleryFolder.findFirst({ where: { userId, isDefault: true } });
      if (!favorites) return reply.code(404).send({ error: "No favorites folder" });

      await db.galleryFolderItem.deleteMany({ where: { folderId: favorites.id, jobId } });
      return { success: true };
    },
  );
};
