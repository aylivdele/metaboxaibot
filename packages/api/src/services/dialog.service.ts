import { db } from "../db.js";
import { AI_MODELS } from "@metabox/shared";
import type { Section } from "@metabox/shared";
import type { Dialog, Message, Prisma } from "@prisma/client";
import { userStateService } from "./user-state.service.js";

/** Shape of one entry in Message.attachments JSON array. */
export interface StoredAttachment {
  s3Key: string;
  mimeType: string;
  name: string;
  size?: number;
}

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

    const dialog = await db.dialog.create({
      data: {
        userId: params.userId,
        section: params.section,
        modelId: params.modelId,
        title: params.title ?? null,
        contextStrategy: model.contextStrategy,
      },
    });

    // Copy settings from the most recent non-deleted dialog with the same model
    const donor = await db.dialog.findFirst({
      where: {
        userId: params.userId,
        modelId: params.modelId,
        isDeleted: false,
        id: { not: dialog.id },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (donor) {
      const donorSettings = await userStateService.getDialogSettings(params.userId, donor.id);
      if (Object.keys(donorSettings).length > 0) {
        await userStateService.setDialogSettings(params.userId, dialog.id, donorSettings);
      }
    }

    return dialog;
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

  async softDelete(dialogId: string, userId: bigint): Promise<void> {
    await db.dialog.update({ where: { id: dialogId }, data: { isDeleted: true } });
    await db.userState
      .update({
        where: { userId, gptDialogId: dialogId },
        data: { gptDialogId: null },
      })
      .catch(() => void 0);
    await userStateService.deleteDialogSettings(userId, dialogId);
  },

  async rename(dialogId: string, title: string): Promise<Dialog> {
    return db.dialog.update({ where: { id: dialogId }, data: { title } });
  },

  /** Save a user or assistant message to the dialog. */
  async saveMessage(
    dialogId: string,
    role: "user" | "assistant",
    content: string,
    extras?: {
      tokensUsed?: number;
      providerMessageId?: string;
      mediaUrl?: string;
      mediaType?: string;
      attachments?: StoredAttachment[];
    },
  ): Promise<Message> {
    return db.message.create({
      data: {
        dialogId,
        role,
        content,
        tokensUsed: extras?.tokensUsed ?? 0,
        providerMessageId: extras?.providerMessageId,
        mediaUrl: extras?.mediaUrl,
        mediaType: extras?.mediaType,
        attachments: extras?.attachments?.length
          ? (extras.attachments as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  },

  /** Mark a message as failed so it is excluded from future LLM history. */
  async markMessageFailed(messageId: string): Promise<void> {
    await db.message.update({ where: { id: messageId }, data: { failed: true } });
  },

  /** Fetch a single message by ID (used for img2img reference lookup). */
  async getMessageById(id: string): Promise<Pick<Message, "id" | "mediaUrl" | "mediaType"> | null> {
    return db.message.findUnique({
      where: { id },
      select: { id: true, mediaUrl: true, mediaType: true },
    });
  },

  /** Fetch all messages for a dialog (for webapp history view). */
  async getMessages(dialogId: string) {
    return db.message.findMany({
      where: { dialogId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        mediaUrl: true,
        mediaType: true,
        attachments: true,
        createdAt: true,
      },
    });
  },

  /** Fetch last N messages for db_history strategy (excludes failed messages). */
  async getHistory(
    dialogId: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      attachments?: StoredAttachment[];
    }>
  > {
    const messages = await db.message.findMany({
      where: { dialogId, failed: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, role: true, content: true, attachments: true },
    });
    return messages.reverse().map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as StoredAttachment[])
        : undefined,
    }));
  },

  /**
   * Update provider-side context pointers after a response.
   *
   * `providerLastResponseKeyId` фиксирует ключ который создал response_id —
   * на следующем turn'е chat-сервис проверяет совпадение с acquired keyId
   * и при mismatch'е дропает previousResponseId (response_id привязан к
   * организации OpenAI, между разными аккаунтами не работает).
   */
  async updateProviderContext(
    dialogId: string,
    updates: {
      providerLastResponseId?: string;
      providerLastResponseKeyId?: string | null;
      providerThreadId?: string;
    },
  ): Promise<void> {
    await db.dialog.update({ where: { id: dialogId }, data: updates });
  },
};
