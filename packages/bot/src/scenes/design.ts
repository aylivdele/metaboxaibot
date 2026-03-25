import type { BotContext } from "../types/context.js";
import {
  dialogService,
  generationService,
  userStateService,
  calculateCost,
} from "@metabox/api/services";
import {
  MODELS_BY_SECTION,
  AI_MODELS,
  MODEL_TO_FAMILY,
  FAMILIES_BY_SECTION,
  config,
  generateWebToken,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";

// ── Model selection keyboard ──────────────────────────────────────────────────

/**
 * Builds the design-section keyboard.
 * Family models are shown as one button per family (uses the saved or default model).
 * Standalone models (no familyId) are shown individually.
 */
export function buildDesignModelKeyboard(savedModelId?: string | null): InlineKeyboard {
  const allModels = MODELS_BY_SECTION["design"] ?? [];
  const families = FAMILIES_BY_SECTION["design"] ?? [];
  const kb = new InlineKeyboard();

  // Collect all model IDs that belong to a family (skip individual buttons for them)
  const familyModelIds = new Set(families.flatMap((f) => f.members.map((m) => m.modelId)));

  // One button per family, using saved model if it's in that family, else defaultModelId
  const rows: Array<[string, string]> = [];
  for (const family of families) {
    const memberIds = new Set(family.members.map((m) => m.modelId));
    const modelId =
      savedModelId && memberIds.has(savedModelId) ? savedModelId : family.defaultModelId;
    rows.push([family.name, `design_family_${family.id}__${modelId}`]);
  }

  // Standalone models
  for (const m of allModels) {
    if (!familyModelIds.has(m.id)) {
      rows.push([m.name, `design_model_${m.id}`]);
    }
  }

  // Layout: 2 per row
  for (let i = 0; i < rows.length; i += 2) {
    kb.text(rows[i][0], rows[i][1]);
    if (rows[i + 1]) kb.text(rows[i + 1][0], rows[i + 1][1]);
    kb.row();
  }
  return kb;
}

// ── Model activation (shared logic) ──────────────────────────────────────────

export async function activateDesignModel(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "DESIGN_ACTIVE", "design");
  await userStateService.setModelForSection(ctx.user.id, "design", modelId);

  const model = AI_MODELS[modelId];
  if (model) {
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const modelSettings = allSettings[modelId] ?? {};
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings);
    const costLine = ctx.t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.design.management,
          `${webappUrl}?page=management&section=design`,
        )
      : undefined;
    await ctx.reply(`🎨 ${model.name}\n\n${model.description}\n\n${costLine}`, {
      reply_markup: kb,
    });
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

/**
 * Family button tapped: data format is `design_family_{familyId}__{modelId}`
 * modelId is the resolved (saved or default) model for this family.
 */
export async function handleDesignFamilySelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = ctx.callbackQuery?.data ?? "";
  // Extract modelId after the __ separator
  const modelId = data.split("__")[1] ?? "";
  // Verify it actually belongs to a known family (safety check)
  if (!modelId || !AI_MODELS[modelId] || !MODEL_TO_FAMILY[modelId]) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await activateDesignModel(ctx, modelId);
}

// ── Incoming prompt in DESIGN_ACTIVE state ────────────────────────────────────

export async function handleDesignMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";

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
  const modelId = state?.designModelId ?? "dall-e-3";

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
  const state = await userStateService.get(ctx.user.id);
  await ctx.reply(ctx.t.design.sectionTitle, {
    reply_markup: buildDesignModelKeyboard(state?.designModelId),
  });
}
