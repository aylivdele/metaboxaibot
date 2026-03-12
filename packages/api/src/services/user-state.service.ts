import { db } from "../db.js";
import type { BotState, Section } from "@metabox/shared";
import type { UserState } from "@prisma/client";

export const userStateService = {
  async get(userId: bigint): Promise<UserState | null> {
    return db.userState.findUnique({ where: { userId } });
  },

  async setState(userId: bigint, state: BotState, section?: Section): Promise<UserState> {
    return db.userState.upsert({
      where: { userId },
      create: { userId, state, section: section ?? null },
      update: { state, ...(section !== undefined ? { section } : {}) },
    });
  },

  async setDialog(userId: bigint, dialogId: string | null): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "GPT_ACTIVE", dialogId },
      update: { dialogId },
    });
  },

  async setModel(userId: bigint, modelId: string): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", modelId },
      update: { modelId },
    });
  },
};
