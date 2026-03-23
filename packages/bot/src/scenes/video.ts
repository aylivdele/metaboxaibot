import type { BotContext } from "../types/context.js";
import {
  videoGenerationService,
  userStateService,
  calculateCost,
} from "@metabox/api/services";
import { MODELS_BY_SECTION, AI_MODELS } from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";

// ── Model selection keyboard ──────────────────────────────────────────────────

export function buildVideoModelKeyboard(): InlineKeyboard {
  const models = MODELS_BY_SECTION["video"] ?? [];
  const kb = new InlineKeyboard();
  for (let i = 0; i < models.length; i += 2) {
    kb.text(models[i].name, `video_model_${models[i].id}`);
    if (models[i + 1]) kb.text(models[i + 1].name, `video_model_${models[i + 1].id}`);
    kb.row();
  }
  return kb;
}

// ── Model selected via inline callback ───────────────────────────────────────

export async function handleVideoModelSelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const modelId = ctx.callbackQuery?.data?.replace("video_model_", "") ?? "";

  await ctx.answerCallbackQuery();
  await userStateService.setState(ctx.user.id, "VIDEO_ACTIVE", "video");
  await userStateService.setModelForSection(ctx.user.id, "video", modelId);

  const model = AI_MODELS[modelId];
  if (model) {
    const cost = calculateCost(model);
    const costLine = ctx.t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
    await ctx.reply(`🎬 ${model.name}\n\n${model.description}\n\n${costLine}`);
  } else {
    await ctx.reply(ctx.t.video.modelActivated);
  }
}

// ── Incoming prompt in VIDEO_ACTIVE state ─────────────────────────────────────

export async function handleVideoMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";

  const videoSettings = await userStateService.getVideoSettings(ctx.user.id);
  const modelSettings = videoSettings[modelId];

  const prompt = ctx.message.text;

  const pendingMsg = await ctx.reply(ctx.t.video.queuing);

  try {
    await videoGenerationService.submitVideo({
      userId: ctx.user.id,
      modelId,
      prompt,
      telegramChatId: chatId,
      sendOriginalLabel: ctx.t.common.sendOriginal,
      aspectRatio: modelSettings?.aspectRatio,
      duration: modelSettings?.duration,
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

    await ctx.reply(ctx.t.video.asyncPending);
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      logger.error(err, "Video message error");
      await ctx.reply(ctx.t.video.generationFailed);
    }
  }
}

// ── New video dialog ──────────────────────────────────────────────────────────

export async function handleNewVideoDialog(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_SECTION", "video");
  await ctx.reply(ctx.t.video.sectionTitle, {
    reply_markup: buildVideoModelKeyboard(),
  });
}

// ── Avatars (stub — full implementation pending) ──────────────────────────────

export async function handleVideoAvatars(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.reply(ctx.t.video.avatars + ctx.t.common.comingSoon);
}

// ── Lip Sync (stub — full implementation pending) ─────────────────────────────

export async function handleVideoLipSync(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.reply(ctx.t.video.lipSync + ctx.t.common.comingSoon);
}
