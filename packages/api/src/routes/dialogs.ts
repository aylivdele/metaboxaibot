import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { dialogService } from "../services/dialog.service.js";
import { userStateService } from "../services/user-state.service.js";
import { db } from "../db.js";
import { getT, AI_MODELS, config, type Section } from "@metabox/shared";
import type { Language } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

export const dialogsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /dialogs?section=gpt — list active dialogs */
  fastify.get<{ Querystring: { section?: string } }>("/dialogs", async (request) => {
    const { userId } = request as AuthRequest;
    const section = request.query.section as Section | undefined;

    const dialogs = await dialogService.listByUser(userId, section);
    return dialogs.map((d) => ({
      id: d.id,
      section: d.section,
      modelId: d.modelId,
      title: d.title ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  });

  /** POST /dialogs — create new dialog */
  fastify.post<{ Body: { section: string; modelId: string; title?: string } }>(
    "/dialogs",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { section, modelId, title } = request.body;

      if (!section || !modelId) {
        return reply.code(400).send({ error: "section and modelId are required" });
      }

      const dialog = await dialogService.create({
        userId,
        section: section as Section,
        modelId,
        title,
      });

      return {
        id: dialog.id,
        section: dialog.section,
        modelId: dialog.modelId,
        title: dialog.title ?? null,
        createdAt: dialog.createdAt.toISOString(),
        updatedAt: dialog.updatedAt.toISOString(),
      };
    },
  );

  /** PATCH /dialogs/:id — rename */
  fastify.patch<{ Params: { id: string }; Body: { title: string } }>(
    "/dialogs/:id",
    async (request, reply) => {
      const { userId } = request as AuthRequest;
      const { id } = request.params;
      const { title } = request.body;

      if (!title) return reply.code(400).send({ error: "title is required" });

      // Verify ownership
      const dialog = await dialogService.findById(id);
      if (!dialog) return reply.code(404).send({ error: "Dialog not found" });
      if (dialog.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

      const updated = await dialogService.rename(id, title);
      return { id: updated.id, title: updated.title };
    },
  );

  /** DELETE /dialogs/:id — soft delete */
  fastify.delete<{ Params: { id: string } }>("/dialogs/:id", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { id } = request.params;

    const dialog = await dialogService.findById(id);
    if (!dialog) return reply.code(404).send({ error: "Dialog not found" });
    if (dialog.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await dialogService.softDelete(id, userId);

    return { success: true };
  });

  /** POST /dialogs/:id/activate — set as active dialog */
  fastify.post<{ Params: { id: string } }>("/dialogs/:id/activate", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { id } = request.params;

    const dialog = await dialogService.findById(id);
    if (!dialog) return reply.code(404).send({ error: "Dialog not found" });
    if (dialog.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await userStateService.setDialogForSection(userId, dialog.section as Section, id);

    // Notify user in chat (fire-and-forget)
    sendDialogSelectedNotification(userId, dialog.title, dialog.modelId).catch(() => void 0);

    return { success: true };
  });

  /** GET /dialogs/:id/messages — message history */
  fastify.get<{ Params: { id: string } }>("/dialogs/:id/messages", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { id } = request.params;

    const dialog = await dialogService.findById(id);
    if (!dialog) return reply.code(404).send({ error: "Dialog not found" });
    if (dialog.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const messages = await dialogService.getMessages(id);
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      mediaUrl: m.mediaUrl ?? null,
      mediaType: m.mediaType ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  });
};

async function sendDialogSelectedNotification(
  userId: bigint,
  title: string | null,
  modelId: string,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { language: true } });
  const t = getT((user?.language ?? "en") as Language);
  const modelName = AI_MODELS[modelId]?.name ?? modelId;
  const text = t.gpt.dialogSelected
    .replace("{title}", title ?? modelId)
    .replace("{model}", modelName);
  await fetch(`https://api.telegram.org/bot${config.bot.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(userId), text }),
  });
}
