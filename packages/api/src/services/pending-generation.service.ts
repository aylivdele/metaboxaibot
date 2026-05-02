import type { PendingGeneration, Prisma } from "@prisma/client";
import { db } from "../db.js";

const TTL_MS = 15 * 60 * 1000;

export type PendingSection = "image" | "video" | "audio";

export interface UpsertPendingInput {
  userId: bigint;
  section: PendingSection;
  modelId: string;
  prompt: string;
  payload: Prisma.InputJsonValue;
  estimatedCost: number;
  chatId: bigint;
  messageId: bigint;
}

export interface UpsertPendingResult {
  row: PendingGeneration;
  /** Previous row that was overwritten (for the bot to disable its old buttons). */
  previous: { chatId: bigint; messageId: bigint } | null;
}

export const pendingGenerationService = {
  async upsert(input: UpsertPendingInput): Promise<UpsertPendingResult> {
    const expiresAt = new Date(Date.now() + TTL_MS);
    const previous = await db.pendingGeneration.findUnique({
      where: { userId: input.userId },
      select: { chatId: true, messageId: true },
    });
    const row = await db.pendingGeneration.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        section: input.section,
        modelId: input.modelId,
        prompt: input.prompt,
        payload: input.payload,
        estimatedCost: input.estimatedCost,
        chatId: input.chatId,
        messageId: input.messageId,
        expiresAt,
      },
      update: {
        section: input.section,
        modelId: input.modelId,
        prompt: input.prompt,
        payload: input.payload,
        estimatedCost: input.estimatedCost,
        chatId: input.chatId,
        messageId: input.messageId,
        expiresAt,
        createdAt: new Date(),
      },
    });
    return { row, previous };
  },

  async getByUser(userId: bigint): Promise<PendingGeneration | null> {
    return db.pendingGeneration.findUnique({ where: { userId } });
  },

  async getById(id: string): Promise<PendingGeneration | null> {
    return db.pendingGeneration.findUnique({ where: { id } });
  },

  async deleteByUser(userId: bigint): Promise<void> {
    await db.pendingGeneration.deleteMany({ where: { userId } });
  },

  async deleteById(id: string): Promise<void> {
    await db.pendingGeneration.deleteMany({ where: { id } });
  },

  async cleanupExpired(): Promise<number> {
    const res = await db.pendingGeneration.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return res.count;
  },
};
