import { db } from "../db.js";
import { AI_MODELS } from "@metabox/shared";
import type { Section } from "@metabox/shared";
import type { Dialog, Message } from "@prisma/client";

export interface CreateDialogParams {
  userId: bigint;
  section: Section;
  modelId: string;
  title?: string;
}

export const dialogService = {
  async create(params: CreateDialogParams): Promise<Dialog> {
    const model = AI_MODELS[params.modelId];
    if (!model) throw new Error(`Unknown model: ${params.modelId}`);

    return db.dialog.create({
      data: {
        userId: params.userId,
        section: params.section,
        modelId: params.modelId,
        title: params.title ?? null,
        contextStrategy: model.contextStrategy,
      },
    });
  },

  async findById(dialogId: string): Promise<Dialog | null> {
    return db.dialog.findUnique({ where: { id: dialogId } });
  },

  async listByUser(userId: bigint, section?: Section): Promise<Dialog[]> {
    return db.dialog.findMany({
      where: { userId, ...(section ? { section } : {}), isDeleted: false },
      orderBy: { updatedAt: "desc" },
    });
  },

  async softDelete(dialogId: string): Promise<void> {
    await db.dialog.update({ where: { id: dialogId }, data: { isDeleted: true } });
  },

  async rename(dialogId: string, title: string): Promise<Dialog> {
    return db.dialog.update({ where: { id: dialogId }, data: { title } });
  },

  /** Save a user or assistant message to the dialog. */
  async saveMessage(
    dialogId: string,
    role: "user" | "assistant",
    content: string,
    extras?: { tokensUsed?: number; providerMessageId?: string },
  ): Promise<Message> {
    return db.message.create({
      data: {
        dialogId,
        role,
        content,
        tokensUsed: extras?.tokensUsed ?? 0,
        providerMessageId: extras?.providerMessageId,
      },
    });
  },

  /** Fetch last N messages for db_history strategy. */
  async getHistory(
    dialogId: string,
    limit: number,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const messages = await db.message.findMany({
      where: { dialogId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { role: true, content: true },
    });
    return messages.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  },

  /** Update provider-side context pointers after a response. */
  async updateProviderContext(
    dialogId: string,
    updates: { providerLastResponseId?: string; providerThreadId?: string },
  ): Promise<void> {
    await db.dialog.update({ where: { id: dialogId }, data: updates });
  },
};
