import type { BotContext } from "../types/context.js";
import { videoGenerationService, userStateService, calculateCost } from "@metabox/api/services";
import { MODELS_BY_SECTION, AI_MODELS, config } from "@metabox/shared";
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
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const modelSettings = allSettings[modelId] ?? {};
    const defaultDuration =
      (modelSettings.duration as number | undefined) ??
      model.supportedDurations?.[0] ??
      model.durationRange?.min ??
      5;
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings, defaultDuration);
    const costLine = ctx.t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.video.management,
          `${webappUrl}?page=management&section=video`,
        )
      : undefined;
    await ctx.reply(`🎬 ${model.name}\n\n${model.description}\n\n${costLine}`, {
      reply_markup: kb,
    });
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

  // For D-ID: pick up any previously saved reference photo (one-shot)
  const imageUrl = await userStateService.getAndClearVideoRefImageUrl(ctx.user.id) ?? undefined;
  // For D-ID: pick up any previously saved driver video URL (one-shot)
  const driverUrl = await userStateService.getAndClearVideoRefDriverUrl(ctx.user.id) ?? undefined;
  // For HeyGen: pick up any previously saved voice recording URL (one-shot)
  const voiceUrl = await userStateService.getAndClearVideoRefVoiceUrl(ctx.user.id) ?? undefined;

  const prompt = ctx.message.text;

  const pendingMsg = await ctx.reply(ctx.t.video.queuing);

  try {
    await videoGenerationService.submitVideo({
      userId: ctx.user.id,
      modelId,
      prompt,
      imageUrl,
      telegramChatId: chatId,
      sendOriginalLabel: ctx.t.common.sendOriginal,
      aspectRatio: modelSettings?.aspectRatio,
      duration: modelSettings?.duration,
      extraModelSettings: driverUrl || voiceUrl
        ? { ...(driverUrl ? { driver_url: driverUrl } : {}), ...(voiceUrl ? { voice_url: voiceUrl } : {}) }
        : undefined,
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

// ── Avatars (HeyGen) ──────────────────────────────────────────────────────────

export async function handleVideoAvatars(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_ACTIVE", "video");
  await userStateService.setModelForSection(ctx.user.id, "video", "heygen");

  const model = AI_MODELS["heygen"];
  if (model) {
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const modelSettings = allSettings["heygen"] ?? {};
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings);
    const costLine = ctx.t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.video.management,
          `${webappUrl}?page=management&section=video`,
        )
      : undefined;
    await ctx.reply(
      `👾 ${model.name}\n\n${model.description}\n\n${costLine}\n\n${ctx.t.video.avatarActivated}`,
      { reply_markup: kb },
    );
  }
}

// ── Lip Sync (D-ID) ───────────────────────────────────────────────────────────

export async function handleVideoLipSync(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_ACTIVE", "video");
  await userStateService.setModelForSection(ctx.user.id, "video", "d-id");

  const model = AI_MODELS["d-id"];
  if (model) {
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const modelSettings = allSettings["d-id"] ?? {};
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings);
    const costLine = ctx.t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.video.management,
          `${webappUrl}?page=management&section=video`,
        )
      : undefined;
    await ctx.reply(
      `🔄 ${model.name}\n\n${model.description}\n\n${costLine}\n\n${ctx.t.video.lipSyncActivated}`,
      { reply_markup: kb },
    );
  }
}

// ── Photo handler in VIDEO_ACTIVE state (D-ID source image) ───────────────────

export async function handleVideoPhoto(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.photo) return;
  const photo = ctx.message.photo.at(-1)!;
  const file = await ctx.api.getFile(photo.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  await userStateService.setVideoRefImageUrl(ctx.user.id, fileUrl);
  await ctx.reply(ctx.t.video.videoPhotoSaved);
}

// ── Video handler in VIDEO_ACTIVE state (D-ID driver_url) ─────────────────────

export async function handleVideoVideo(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.video) return;
  const file = await ctx.api.getFile(ctx.message.video.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  await userStateService.setVideoRefDriverUrl(ctx.user.id, fileUrl);
  await ctx.reply(ctx.t.video.videoDriverSaved);
}

// ── Voice handler in VIDEO_ACTIVE state (HeyGen audio voice) ──────────────────

export async function handleVideoVoice(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.voice) return;
  const file = await ctx.api.getFile(ctx.message.voice.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  await userStateService.setVideoRefVoiceUrl(ctx.user.id, fileUrl);
  await ctx.reply(ctx.t.video.videoVoiceSaved);
}
