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
} from "@metabox/api/services";
import { db } from "@metabox/api/db";
import {
  AI_MODELS,
  resolveModelDisplay,
  UserFacingError,
  resolveUserFacingError,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { replyNoSubscription, replyInsufficientTokens } from "./reply-error.js";
import { ensureELTtsForVideo } from "./el-tts.js";
import { logger } from "../logger.js";

export type ConfirmKind = "image" | "video" | "audio";
export type ConfirmSubmitParams = SubmitImageParams | SubmitVideoParams | SubmitAudioParams;

interface GateInput {
  ctx: BotContext;
  kind: ConfirmKind;
  modelId: string;
  prompt: string;
  submitParams: ConfirmSubmitParams;
  /** Override displayed prompt — e.g. placeholder for HeyGen voice-only path. */
  promptDisplay?: string;
}

const PROMPT_DISPLAY_MAX = 300;
const PROMPT_DISPLAY_HALF = 140;

function truncatePromptForDisplay(prompt: string): string {
  if (prompt.length <= PROMPT_DISPLAY_MAX) return prompt;
  return `${prompt.slice(0, PROMPT_DISPLAY_HALF)} […] ${prompt.slice(-PROMPT_DISPLAY_HALF)}`;
}

function bigintToString(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? v.toString() : v;
}

function serializePayload(params: ConfirmSubmitParams): unknown {
  return JSON.parse(JSON.stringify(params, bigintToString));
}

function deserializePayload(json: unknown, _kind: ConfirmKind): ConfirmSubmitParams {
  const obj = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
  if (typeof obj.userId === "string") obj.userId = BigInt(obj.userId);
  return obj as unknown as ConfirmSubmitParams;
}

/**
 * If the user has confirm-before-generate ON, sends a confirmation message,
 * persists the pending request, and returns true (caller must NOT proceed
 * with submit). Returns false when the gate is off — caller falls through
 * to its existing submit logic.
 */
export async function gateLowIqMode(input: GateInput): Promise<boolean> {
  const { ctx, kind, modelId, prompt, submitParams, promptDisplay } = input;
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
  const displayedPrompt = promptDisplay ?? truncatePromptForDisplay(prompt);
  const text = ctx.t.confirmGeneration.message
    .replace("{model}", modelName)
    .replace("{prompt}", displayedPrompt)
    .replace("{cost}", cost.toFixed(2));

  const kb = new InlineKeyboard()
    .text(ctx.t.confirmGeneration.start, "lqg:start")
    .text(ctx.t.confirmGeneration.cancel, "lqg:cancel");
  const sent = await ctx.reply(text, { reply_markup: kb });

  const { previous } = await pendingGenerationService.upsert({
    userId: ctx.user.id,
    section: kind,
    modelId,
    prompt,
    payload: serializePayload(submitParams) as object,
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
        ? ctx.t.video.asyncPending
        : ctx.t.design.generating;
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
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else if (err instanceof UserFacingError) {
      await ctx.reply(resolveUserFacingError(err, ctx.t.errors));
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

export async function handleLowIqCancel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await pendingGenerationService.deleteByUser(ctx.user.id);
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
  await ctx.reply(ctx.t.confirmGeneration.cancelled);
}
