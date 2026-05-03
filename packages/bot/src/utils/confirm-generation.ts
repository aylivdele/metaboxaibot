import type { BotContext } from "../types/context.js";
import type {
  SubmitImageParams,
  SubmitVideoParams,
  SubmitAudioParams,
} from "@metabox/api/services";
import {
  generationService,
  videoGenerationService,
  audioGenerationService,
  pendingGenerationService,
  costPreviewService,
  userStateService,
} from "@metabox/api/services";
import { db } from "@metabox/api/db";
import {
  AI_MODELS,
  config,
  generateWebToken,
  resolveModelDisplay,
  UserFacingError,
  resolveUserFacingErrorVariant,
  type AIModel,
  type MediaInputSlot,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { replyNoSubscription, replyInsufficientTokens } from "./reply-error.js";
import { ensureELTtsForVideo } from "./el-tts.js";
import { pickVideoPending, pickDesignPending } from "./pending-messages.js";
import { buildMediaInputStatusMenu } from "./media-input-state.js";
import { logger } from "../logger.js";

export type ConfirmKind = "image" | "video" | "audio";
export type ConfirmSubmitParams = SubmitImageParams | SubmitVideoParams | SubmitAudioParams;

/**
 * Snapshot of state values consumed at scene-time (before gate).
 * On Cancel, these are restored to userState so the user doesn't have to re-upload.
 * Captured by the caller right before the existing `clearMediaInputs` / `getAndClear*`
 * calls — values are exactly what was about to be wiped.
 */
export interface RestoreSnapshot {
  mediaInputs?: Record<string, string[]>;
  videoRefImageUrl?: string;
  videoRefDriverUrl?: string;
  videoRefVoiceUrl?: string;
  designRefMessageId?: string;
}

interface GateInput {
  ctx: BotContext;
  kind: ConfirmKind;
  modelId: string;
  prompt: string;
  submitParams: ConfirmSubmitParams;
  /** Override displayed prompt — e.g. placeholder for HeyGen voice-only path. */
  promptDisplay?: string;
  /** Snapshot of cleared state (slots + one-shot refs) for Cancel-restore. */
  restoreSnapshot?: RestoreSnapshot;
}

const SNAPSHOT_KEY = "__restoreSnapshot__";

/**
 * Telegram message limit is 4096 chars; header + cost line + blockquote tags
 * use ~80 chars, so cap the prompt body at ~4000 with safety margin.
 * Long prompts are tail-truncated with ellipsis (rare — most prompts are << 4000).
 */
const PROMPT_DISPLAY_MAX = 3900;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clampPromptForDisplay(prompt: string): string {
  if (prompt.length <= PROMPT_DISPLAY_MAX) return prompt;
  return `${prompt.slice(0, PROMPT_DISPLAY_MAX - 3)}...`;
}

function bigintToString(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? v.toString() : v;
}

function serializePayload(params: ConfirmSubmitParams): Record<string, unknown> {
  return JSON.parse(JSON.stringify(params, bigintToString)) as Record<string, unknown>;
}

function deserializePayload(json: unknown, _kind: ConfirmKind): ConfirmSubmitParams {
  const obj = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
  delete obj[SNAPSHOT_KEY];
  if (typeof obj.userId === "string") obj.userId = BigInt(obj.userId);
  return obj as unknown as ConfirmSubmitParams;
}

function extractSnapshot(json: unknown): RestoreSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const raw = obj[SNAPSHOT_KEY];
  if (!raw || typeof raw !== "object") return null;
  return raw as RestoreSnapshot;
}

type MediaKind = "photo" | "video" | "audio";

function inferKindFromSlot(slot: MediaInputSlot): MediaKind {
  if (slot.mode === "reference_audio" || slot.mode === "driving_audio") return "audio";
  if (
    slot.mode === "reference_video" ||
    slot.mode === "motion_video" ||
    slot.mode === "first_clip"
  ) {
    return "video";
  }
  return "photo";
}

/**
 * Choose telegram-sendable source per slot element. `tg:kind:fileId` raw markers
 * stripped → fileId (free re-send, no download). Anything else (S3 key, internal
 * scheme, raw URL без http) — берём resolved URL, который уже прогнан через
 * `resolveMediaInputUrls` и гарантированно кликабельный для Telegram.
 *
 * Длины массивов могут не совпадать (raw отсутствует / partial) — в этом случае
 * fallback на resolved для всех элементов.
 */
function buildSendableSources(resolved: string[], raws: string[] | undefined): string[] {
  if (!raws || raws.length !== resolved.length) return resolved;
  return resolved.map((res, i) => {
    const raw = raws[i];
    if (raw && raw.startsWith("tg:")) {
      const idx = raw.indexOf(":", 3);
      return idx === -1 ? raw.slice(3) : raw.slice(idx + 1);
    }
    return res;
  });
}

/**
 * Sends one preview message per filled media slot, with a caption explaining
 * which slot the media will be used as. Called BEFORE the confirm message so
 * the user can visually verify their uploads before clicking Start.
 *
 * Prefer `rawInputs` (e.g. `tg:photo:fileId`) over resolved URLs to leverage
 * Telegram file_id reuse and avoid re-downloading.
 */
async function sendMediaPreviews(
  ctx: BotContext,
  model: AIModel,
  resolvedInputs: Record<string, string[]>,
  rawInputs: Record<string, string[]> | undefined,
): Promise<void> {
  const slots = model.mediaInputs ?? [];
  for (const slot of slots) {
    const resolved = resolvedInputs[slot.slotKey];
    if (!resolved?.length) continue;
    const raws = rawInputs?.[slot.slotKey];
    const sources = buildSendableSources(resolved, raws);
    const kind = inferKindFromSlot(slot);
    const label = ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
    const captionKey: keyof typeof ctx.t.confirmGeneration =
      sources.length === 1
        ? kind === "photo"
          ? "mediaPreviewPhotoSingle"
          : kind === "video"
            ? "mediaPreviewVideoSingle"
            : "mediaPreviewAudioSingle"
        : kind === "photo"
          ? "mediaPreviewPhotoMulti"
          : kind === "video"
            ? "mediaPreviewVideoMulti"
            : "mediaPreviewAudioMulti";
    const caption = ctx.t.confirmGeneration[captionKey].replace("{label}", label);

    try {
      if (sources.length === 1) {
        const src = sources[0];
        if (kind === "photo") await ctx.replyWithPhoto(src, { caption });
        else if (kind === "video") await ctx.replyWithVideo(src, { caption });
        else await ctx.replyWithAudio(src, { caption });
      } else {
        const media = sources.map((src, i) => ({
          type: kind,
          media: src,
          ...(i === 0 ? { caption } : {}),
        }));
        // grammY's replyWithMediaGroup type is restrictive on inputs; safe-cast
        // since we've narrowed kind above and Telegram accepts mixed strings.
        await ctx.replyWithMediaGroup(
          media as unknown as Parameters<typeof ctx.replyWithMediaGroup>[0],
        );
      }
    } catch (err) {
      logger.warn(
        { err, slotKey: slot.slotKey, kind, count: sources.length },
        "sendMediaPreviews: failed to send slot preview, continuing",
      );
    }
  }
}

/**
 * If the user has confirm-before-generate ON, sends a confirmation message,
 * persists the pending request, and returns true (caller must NOT proceed
 * with submit). Returns false when the gate is off — caller falls through
 * to its existing submit logic.
 */
export async function gateLowIqMode(input: GateInput): Promise<boolean> {
  const { ctx, kind, modelId, prompt, submitParams, promptDisplay, restoreSnapshot } = input;
  if (!ctx.user || !ctx.chat) return false;

  const user = await db.user.findUnique({
    where: { id: ctx.user.id },
    select: { confirmBeforeGenerate: true },
  });
  if (!user || !user.confirmBeforeGenerate) return false;

  let cost: number;
  try {
    if (kind === "image") {
      cost = (await costPreviewService.previewImage(submitParams as SubmitImageParams)).cost;
    } else if (kind === "video") {
      cost = (await costPreviewService.previewVideo(submitParams as SubmitVideoParams)).cost;
    } else {
      cost = (await costPreviewService.previewAudio(submitParams as SubmitAudioParams)).cost;
    }
  } catch (err) {
    logger.warn(
      { err, kind, modelId },
      "gateLowIqMode: cost preview failed; bypassing confirmation",
    );
    return false;
  }

  const model = AI_MODELS[modelId];
  const modelName = model ? resolveModelDisplay(modelId, ctx.user.language, model).name : modelId;
  const displayedPrompt = promptDisplay ?? clampPromptForDisplay(prompt);
  const text = ctx.t.confirmGeneration.message
    .replace("{model}", escapeHtml(modelName))
    .replace("{prompt}", escapeHtml(displayedPrompt))
    .replace("{cost}", cost.toFixed(2));

  // Send per-slot media previews BEFORE the confirm message so the user can
  // visually verify uploads. Only for image/video kinds with mediaInputs.
  if (model && (kind === "image" || kind === "video")) {
    const submitMedia = (submitParams as SubmitImageParams | SubmitVideoParams).mediaInputs;
    if (submitMedia && Object.keys(submitMedia).length > 0) {
      await sendMediaPreviews(ctx, model, submitMedia, restoreSnapshot?.mediaInputs);
    }
  }

  const kb = new InlineKeyboard()
    .text(ctx.t.confirmGeneration.start, "lqg:start")
    .text(ctx.t.confirmGeneration.cancel, "lqg:cancel");
  const sent = await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });

  const payloadObj = serializePayload(submitParams);
  if (restoreSnapshot && Object.keys(restoreSnapshot).length > 0) {
    payloadObj[SNAPSHOT_KEY] = restoreSnapshot;
  }

  const { previous } = await pendingGenerationService.upsert({
    userId: ctx.user.id,
    section: kind,
    modelId,
    prompt,
    payload: payloadObj as object,
    estimatedCost: cost,
    chatId: BigInt(ctx.chat.id),
    messageId: BigInt(sent.message_id),
  });

  if (previous) {
    await ctx.api
      .editMessageReplyMarkup(Number(previous.chatId), Number(previous.messageId), {
        reply_markup: { inline_keyboard: [] },
      })
      .catch(() => void 0);
  }

  return true;
}

async function runReplaySubmit(
  ctx: BotContext,
  kind: ConfirmKind,
  params: ConfirmSubmitParams,
): Promise<void> {
  if (!ctx.user || !ctx.chat) return;
  const chatId = ctx.chat.id;
  const pendingText =
    kind === "audio"
      ? ctx.t.audio.processing
      : kind === "video"
        ? pickVideoPending(ctx)
        : pickDesignPending(ctx);
  const pendingMsg = await ctx.reply(pendingText);

  try {
    if (kind === "image") {
      await generationService.submitImage(params as SubmitImageParams);
    } else if (kind === "video") {
      // EL TTS pre-gen for HeyGen+EL is deferred until here so cancelling the
      // confirm message costs the user $0 in EL spend.
      const videoParams = await ensureELTtsForVideo(params as SubmitVideoParams);
      await videoGenerationService.submitVideo(videoParams);
    } else {
      await audioGenerationService.submitAudio(params as SubmitAudioParams);
    }
    // pendingMsg намеренно НЕ удаляется на успехе — остаётся как «в процессе»-
    // индикатор, пока воркер не пришлёт финальный результат. Mirrors confirm-off
    // scene behavior (audio/design просто оставляют pendingMsg).
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else if (err instanceof UserFacingError) {
      await ctx.reply(resolveUserFacingErrorVariant(err, ctx.t));
    } else {
      logger.error({ err, kind }, "runReplaySubmit failed");
      const failKey =
        kind === "audio"
          ? ctx.t.audio.generationFailed
          : kind === "video"
            ? ctx.t.video.generationFailed
            : ctx.t.design.generationFailed;
      await ctx.reply(failKey);
    }
  }
}

export async function handleLowIqStart(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const callbackMessageId = ctx.callbackQuery?.message?.message_id;
  const pending = await pendingGenerationService.getByUser(ctx.user.id);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: ctx.t.confirmGeneration.expired });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
    return;
  }
  if (callbackMessageId !== undefined && BigInt(callbackMessageId) !== pending.messageId) {
    await ctx.answerCallbackQuery({ text: ctx.t.confirmGeneration.replaced });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
    return;
  }
  if (pending.expiresAt.getTime() < Date.now()) {
    await pendingGenerationService.deleteById(pending.id);
    await ctx.answerCallbackQuery({ text: ctx.t.confirmGeneration.expired });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
  await pendingGenerationService.deleteById(pending.id);

  const kind = pending.section as ConfirmKind;
  const params = deserializePayload(pending.payload, kind);
  await runReplaySubmit(ctx, kind, params);
}

async function restoreFromSnapshot(
  userId: bigint,
  modelId: string,
  snapshot: RestoreSnapshot,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (snapshot.mediaInputs) {
    tasks.push(
      userStateService
        .setMediaInputsForModel(userId, modelId, snapshot.mediaInputs)
        .catch((err) => logger.warn({ err, userId, modelId }, "restoreFromSnapshot: mediaInputs")),
    );
  }
  if (snapshot.videoRefImageUrl) {
    tasks.push(
      userStateService
        .setVideoRefImageUrl(userId, snapshot.videoRefImageUrl)
        .catch((err) => logger.warn({ err, userId }, "restoreFromSnapshot: videoRefImageUrl")),
    );
  }
  if (snapshot.videoRefDriverUrl) {
    tasks.push(
      userStateService
        .setVideoRefDriverUrl(userId, snapshot.videoRefDriverUrl)
        .catch((err) => logger.warn({ err, userId }, "restoreFromSnapshot: videoRefDriverUrl")),
    );
  }
  if (snapshot.videoRefVoiceUrl) {
    tasks.push(
      userStateService
        .setVideoRefVoiceUrl(userId, snapshot.videoRefVoiceUrl)
        .catch((err) => logger.warn({ err, userId }, "restoreFromSnapshot: videoRefVoiceUrl")),
    );
  }
  if (snapshot.designRefMessageId) {
    tasks.push(
      userStateService
        .setDesignRefMessage(userId, snapshot.designRefMessageId)
        .catch((err) => logger.warn({ err, userId }, "restoreFromSnapshot: designRefMessageId")),
    );
  }
  await Promise.all(tasks);
}

/**
 * Builds the post-cancel inline keyboard: media-input slots + management webapp button.
 * Mirrors what the model activation message shows, so the user can immediately
 * tweak slots or settings after cancelling.
 */
async function buildPostCancelKeyboard(
  ctx: BotContext,
  section: "image" | "video",
  modelId: string,
): Promise<InlineKeyboard | undefined> {
  if (!ctx.user) return undefined;
  const model = AI_MODELS[modelId];
  if (!model) return undefined;

  const kb = new InlineKeyboard();
  if (model.mediaInputs?.length) {
    const filledInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
    const sceneSection = section === "image" ? "design" : "video";
    const { kb: slotsKb } = buildMediaInputStatusMenu(
      model.mediaInputs,
      filledInputs,
      sceneSection,
      ctx.t,
      {
        promptOptional: model.promptOptional,
        promptOptionalRequiresMedia: model.promptOptionalRequiresMedia,
      },
    );
    for (const row of slotsKb.inline_keyboard) {
      kb.row(...row);
    }
  }

  const webappUrl = config.bot.webappUrl;
  if (webappUrl) {
    const wtoken = generateWebToken(ctx.user.id, config.bot.token);
    const sectionParam = section === "image" ? "design" : "video";
    const mgmtLabel = section === "image" ? ctx.t.design.management : ctx.t.video.management;
    kb.webApp(mgmtLabel, `${webappUrl}?page=management&section=${sectionParam}&wtoken=${wtoken}`);
  }

  return kb.inline_keyboard.length ? kb : undefined;
}

/** True if snapshot has at least one non-empty slot/ref worth restoring. */
function snapshotHasFiles(snapshot: RestoreSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.mediaInputs) {
    for (const arr of Object.values(snapshot.mediaInputs)) {
      if (arr && arr.length > 0) return true;
    }
  }
  if (snapshot.videoRefImageUrl) return true;
  if (snapshot.videoRefDriverUrl) return true;
  if (snapshot.videoRefVoiceUrl) return true;
  if (snapshot.designRefMessageId) return true;
  return false;
}

export async function handleLowIqCancel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const pending = await pendingGenerationService.getByUser(ctx.user.id);
  let menuKb: InlineKeyboard | undefined;
  let hadFiles = false;
  if (pending) {
    const snapshot = extractSnapshot(pending.payload);
    if (snapshot) {
      hadFiles = snapshotHasFiles(snapshot);
      await restoreFromSnapshot(ctx.user.id, pending.modelId, snapshot);
    }
    if (pending.section === "image" || pending.section === "video") {
      menuKb = await buildPostCancelKeyboard(ctx, pending.section, pending.modelId);
    }
  }
  await pendingGenerationService.deleteByUser(ctx.user.id);
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
  const text = hadFiles
    ? ctx.t.confirmGeneration.cancelledWithFiles
    : ctx.t.confirmGeneration.cancelled;
  await ctx.reply(text, menuKb ? { reply_markup: menuKb } : undefined);
}
