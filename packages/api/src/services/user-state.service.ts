import { db } from "../db.js";
import type { BotState, Section } from "@metabox/shared";
import type { UserState } from "@prisma/client";

/** Maps a section name to the corresponding UserState dialog-ID field. */
function dialogField(
  section: Section,
): "gptDialogId" | "designDialogId" | "audioDialogId" | "videoDialogId" {
  const map = {
    gpt: "gptDialogId",
    design: "designDialogId",
    audio: "audioDialogId",
    video: "videoDialogId",
  } as const;
  return map[section];
}

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

  async setDialogForSection(
    userId: bigint,
    section: Section,
    dialogId: string | null,
  ): Promise<void> {
    const field = dialogField(section);
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", [field]: dialogId },
      update: { [field]: dialogId },
    });
  },

  /** Returns the active dialogId for a given section, or null. */
  async getDialogForSection(userId: bigint, section: Section): Promise<string | null> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state) return null;
    return state[dialogField(section)] ?? null;
  },

  async setModel(userId: bigint, modelId: string): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", modelId },
      update: { modelId },
    });
  },
};
