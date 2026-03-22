import type { BotContext } from "../types/context.js";
import {
  dialogService,
  generationService,
  userStateService,
  calculateCost,
} from "@metabox/api/services";
import { MODELS_BY_SECTION, AI_MODELS, config, generateWebToken } from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";

// ── Model selection keyboard ──────────────────────────────────────────────────

export function buildDesignModelKeyboard(): InlineKeyboard {
  const models = MODELS_BY_SECTION["design"] ?? [];
  const kb = new InlineKeyboard();
  for (let i = 0; i < models.length; i += 2) {
    kb.text(models[i].name, `design_model_${models[i].id}`);
    if (models[i + 1]) kb.text(models[i + 1].name, `design_model_${models[i + 1].id}`);
    kb.row();
  }
  return kb;
}

// ── Model activation (shared logic) ──────────────────────────────────────────

export async function activateDesignModel(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "DESIGN_ACTIVE", "design");
  await userStateService.setModel(ctx.user.id, modelId);

  const model = AI_MODELS[modelId];
  if (model) {
    const cost = calculateCost(model);
    const costLine = ctx.t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
    await ctx.reply(`🎨 ${model.name}\n\n${model.description}\n\n${costLine}`);
  } else {
    await ctx.reply(ctx.t.design.modelActivated);
  }
}

// ── Model selected via inline callback ───────────────────────────────────────

export async function handleDesignModelSelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const modelId = ctx.callbackQuery?.data?.replace("design_model_", "") ?? "";
  await ctx.answerCallbackQuery();
  await activateDesignModel(ctx, modelId);
}

// ── Incoming prompt in DESIGN_ACTIVE state ────────────────────────────────────

export async function handleDesignMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.modelId ?? "dall-e-3";

  // Auto-create dialog if none exists for this design session
  let dialogId = state?.designDialogId ?? null;
  if (!dialogId) {
    const dialog = await dialogService.create({
      userId: ctx.user.id,
      section: "design",
      modelId,
    });
    await userStateService.setDialogForSection(ctx.user.id, "design", dialog.id);
    dialogId = dialog.id;
  }

  // Resolve reference image (one-shot)
  const refMessageId = state?.designRefMessageId ?? null;
  let sourceImageUrl: string | undefined;
  if (refMessageId) {
    const msg = await dialogService.getMessageById(refMessageId);
    sourceImageUrl = msg?.mediaUrl ?? undefined;
    await userStateService.setDesignRefMessage(ctx.user.id, null);
  }

  // Read saved aspect ratio for this model
  const imageSettings = await userStateService.getImageSettings(ctx.user.id);
  const aspectRatio = imageSettings[modelId]?.aspectRatio;

  const prompt = ctx.message.text;
  const pendingMsg = await ctx.reply(ctx.t.design.generating);

  try {
    const result = await generationService.submitImage({
      userId: ctx.user.id,
      modelId,
      prompt,
      sourceImageUrl,
      telegramChatId: chatId,
      dialogId,
      sendOriginalLabel: ctx.t.common.sendOriginal,
      aspectRatio,
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

    if (!result.isPending && result.imageUrl) {
      // Sync result (DALL-E 3) — send immediately with optional Refine + Send as file buttons
      const model = AI_MODELS[modelId];
      const caption = `🎨 ${prompt.slice(0, 200)}${sourceImageUrl ? ` ${ctx.t.design.withReference}` : ""}`;
      const kb = new InlineKeyboard();
      if (model?.supportsImages && result.assistantMessageId) {
        kb.text(ctx.t.design.refine, `design_ref_${result.assistantMessageId}`);
      }
      kb.text(ctx.t.common.sendOriginal, `orig_${result.dbJobId}`);
      await ctx.replyWithPhoto(result.imageUrl, { caption, reply_markup: kb });
    } else {
      // Async — worker will notify when done
      await ctx.reply(ctx.t.design.asyncPending);
    }
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      logger.error(err, "Design message error");
      await ctx.reply(ctx.t.design.generationFailed);
    }
  }
}

// ── Incoming photo in DESIGN_ACTIVE state — set as reference ──────────────────

export async function handleDesignPhoto(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.photo) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.modelId ?? "dall-e-3";

  // Auto-create dialog if none exists
  let dialogId = state?.designDialogId ?? null;
  if (!dialogId) {
    const dialog = await dialogService.create({
      userId: ctx.user.id,
      section: "design",
      modelId,
    });
    await userStateService.setDialogForSection(ctx.user.id, "design", dialog.id);
    dialogId = dialog.id;
  }

  // Get highest-resolution photo
  const photo = ctx.message.photo.at(-1)!;
  const file = await ctx.api.getFile(photo.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;

  // Save as a user message with mediaUrl
  const msg = await dialogService.saveMessage(dialogId, "user", ctx.t.design.photoAsReference, {
    mediaUrl: fileUrl,
    mediaType: "image",
  });

  // Mark this message as the next reference (one-shot)
  await userStateService.setDesignRefMessage(ctx.user.id, msg.id);

  await ctx.reply(ctx.t.design.photoSaved);
}

// ── Callback: user tapped "Refine" under a generated image ───────────────────

export async function handleDesignRefSelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const messageId = ctx.callbackQuery!.data!.replace("design_ref_", "");
  await userStateService.setDesignRefMessage(ctx.user.id, messageId);
  await ctx.answerCallbackQuery(ctx.t.design.refSelected);
}

// ── Management — opens Mini App ───────────────────────────────────────────────

export async function handleDesignManagement(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const webappUrl = config.bot.webappUrl;
  if (!webappUrl) {
    await ctx.reply(ctx.t.errors.unexpected);
    return;
  }
  const token = generateWebToken(ctx.user.id, config.bot.token);
  const kb = new InlineKeyboard().webApp(
    ctx.t.design.management,
    `${webappUrl}?page=management&section=design&wtoken=${token}`,
  );
  await ctx.reply(ctx.t.design.management, { reply_markup: kb });
}

// ── New design dialog ─────────────────────────────────────────────────────────

export async function handleNewDesignDialog(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "DESIGN_SECTION", "design");
  await ctx.reply(ctx.t.design.sectionTitle, {
    reply_markup: buildDesignModelKeyboard(),
  });
}
