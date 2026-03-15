import type { BotContext } from "../types/context.js";
import { videoGenerationService, userStateService, dialogService } from "@metabox/api/services";
import { MODELS_BY_SECTION } from "@metabox/shared";
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
  await userStateService.setModel(ctx.user.id, modelId);

  await ctx.reply(
    `🎬 ${modelId} activated.\nSend me a text prompt (and optionally attach an image) to generate a video.`,
  );
}

// ── Incoming prompt in VIDEO_ACTIVE state ─────────────────────────────────────

export async function handleVideoMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const activeDialog = !!state?.videoDialogId && await dialogService.findById(state.videoDialogId)
  const modelId = activeDialog ? activeDialog.modelId : "kling";
  const prompt = ctx.message.text;

  const pendingMsg = await ctx.reply("🎬 Queuing your video generation...");

  try {
    await videoGenerationService.submitVideo({
      userId: ctx.user.id,
      modelId,
      prompt,
      telegramChatId: chatId,
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

    await ctx.reply(
      "⏳ Your video is being generated. This may take several minutes — you will receive it when it's ready.",
    );
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      logger.error(err, "Video message error");
      await ctx.reply("❌ Failed to queue video generation. Please try again.");
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
