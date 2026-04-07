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

/** Maps a media section to the corresponding UserState model-ID field. */
function sectionModelField(
  section: "design" | "audio" | "video",
): "designModelId" | "audioModelId" | "videoModelId" {
  const map = {
    design: "designModelId",
    audio: "audioModelId",
    video: "videoModelId",
  } as const;
  return map[section];
}

export const userStateService = {
  async get(userId: bigint): Promise<UserState | null> {
    return db.userState.findUnique({ where: { userId } });
  },

  async setState(userId: bigint, state: BotState, section?: Section | null): Promise<UserState> {
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

  async setGptModel(userId: bigint, modelId: string): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", gptModelId: modelId },
      update: { gptModelId: modelId },
    });
  },

  /** Saves the selected model for a media section (design/audio/video) independently. */
  async setModelForSection(
    userId: bigint,
    section: "design" | "audio" | "video",
    modelId: string,
  ): Promise<void> {
    const field = sectionModelField(section);
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", [field]: modelId },
      update: { [field]: modelId },
    });
  },

  /** Set (or clear) the design reference message for img2img. Null = clear. */
  async setDesignRefMessage(userId: bigint, messageId: string | null): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", designRefMessageId: messageId },
      update: { designRefMessageId: messageId },
    });
  },

  /** Save a Telegram photo URL as the D-ID lip-sync reference (one-shot). */
  async setVideoRefImageUrl(userId: bigint, url: string): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", videoRefImageUrl: url },
      update: { videoRefImageUrl: url },
    });
  },

  /** Retrieve and clear the saved video ref image URL (one-shot). Returns null if not set. */
  async getAndClearVideoRefImageUrl(userId: bigint): Promise<string | null> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state?.videoRefImageUrl) return null;
    await db.userState.update({ where: { userId }, data: { videoRefImageUrl: null } });
    return state.videoRefImageUrl;
  },

  /** Save a Telegram video URL as the D-ID driver_url reference (one-shot). */
  async setVideoRefDriverUrl(userId: bigint, url: string): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", videoRefDriverUrl: url },
      update: { videoRefDriverUrl: url },
    });
  },

  /** Retrieve and clear the saved driver video URL (one-shot). Returns null if not set. */
  async getAndClearVideoRefDriverUrl(userId: bigint): Promise<string | null> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state?.videoRefDriverUrl) return null;
    await db.userState.update({ where: { userId }, data: { videoRefDriverUrl: null } });
    return state.videoRefDriverUrl;
  },

  /** Save a Telegram voice message URL as the HeyGen audio voice source (one-shot). */
  async setVideoRefVoiceUrl(userId: bigint, url: string): Promise<void> {
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", videoRefVoiceUrl: url },
      update: { videoRefVoiceUrl: url },
    });
  },

  /** Retrieve and clear the saved voice URL (one-shot). Returns null if not set. */
  async getAndClearVideoRefVoiceUrl(userId: bigint): Promise<string | null> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state?.videoRefVoiceUrl) return null;
    await db.userState.update({ where: { userId }, data: { videoRefVoiceUrl: null } });
    return state.videoRefVoiceUrl;
  },

  /** Returns per-model image settings: { [modelId]: { aspectRatio: string } } */
  async getImageSettings(userId: bigint): Promise<Record<string, { aspectRatio: string }>> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state?.imageSettings) return {};
    return state.imageSettings as Record<string, { aspectRatio: string }>;
  },

  /** Saves the aspect ratio for a specific model without touching other models' settings. */
  async setImageAspectRatio(userId: bigint, modelId: string, aspectRatio: string): Promise<void> {
    const current = await this.getImageSettings(userId);
    const updated = { ...current, [modelId]: { aspectRatio } };
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", imageSettings: updated },
      update: { imageSettings: updated },
    });
  },

  /** Returns per-model video settings: { [modelId]: { aspectRatio?: string; duration?: number } } */
  async getVideoSettings(
    userId: bigint,
  ): Promise<Record<string, { aspectRatio?: string; duration?: number }>> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state?.videoSettings) return {};
    return state.videoSettings as Record<string, { aspectRatio?: string; duration?: number }>;
  },

  /** Saves aspectRatio and/or duration for a video model, merging with existing settings. */
  async setVideoSetting(
    userId: bigint,
    modelId: string,
    patch: { aspectRatio?: string; duration?: number },
  ): Promise<void> {
    const current = await this.getVideoSettings(userId);
    const existing = current[modelId] ?? {};
    const updated = { ...current, [modelId]: { ...existing, ...patch } };
    await db.userState.upsert({
      where: { userId },
      create: { userId, state: "IDLE", videoSettings: updated },
      update: { videoSettings: updated },
    });
  },

  /** Returns all per-model custom settings for a user. */
  async getModelSettings(userId: bigint): Promise<Record<string, Record<string, unknown>>> {
    const state = await db.userState.findUnique({ where: { userId } });
    if (!state?.modelSettings) return {};
    return state.modelSettings as Record<string, Record<string, unknown>>;
  },

  /** Merges the given key/value pairs into the stored settings for a specific model.
   *
   * Uses a single atomic SQL upsert with jsonb concatenation (||) to avoid
   * the lost-update race condition of a read-modify-write cycle. The merge is:
   *   modelSettings = COALESCE(modelSettings, '{}') || { modelId: COALESCE(modelSettings->modelId, '{}') || settings }
   */
  async setModelSettings(
    userId: bigint,
    modelId: string,
    settings: Record<string, unknown>,
  ): Promise<void> {
    const settingsJson = JSON.stringify(settings);
    // Atomic jsonb merge: deep-merge settings into modelSettings[modelId]
    // without reading the current value first.
    await db.$executeRaw`
      INSERT INTO "UserState" ("userId", "state", "modelSettings")
      VALUES (
        ${userId},
        'IDLE',
        jsonb_build_object(${modelId}::text, ${settingsJson}::jsonb)
      )
      ON CONFLICT ("userId") DO UPDATE
      SET "modelSettings" = COALESCE("UserState"."modelSettings", '{}'::jsonb)
        || jsonb_build_object(
             ${modelId}::text,
             COALESCE("UserState"."modelSettings"->${modelId}, '{}'::jsonb)
               || ${settingsJson}::jsonb
           )
    `;
  },
};
