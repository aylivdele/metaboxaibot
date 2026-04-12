import type { BotContext } from "../types/context.js";
import {
  dialogService,
  generationService,
  userStateService,
  getFileUrl,
} from "@metabox/api/services";
import type { SubmitImageResult } from "@metabox/api/services";
import { generateDownloadToken } from "@metabox/api/utils/download-token";
import { InputFile } from "grammy";
import { buildCostLine } from "../utils/cost-line.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";
import {
  MODELS_BY_SECTION,
  AI_MODELS,
  MODEL_TO_FAMILY,
  FAMILIES_BY_SECTION,
  config,
  generateWebToken,
  UserFacingError,
  resolveUserFacingError,
  resolveModelDisplay,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";

// ── Random design pending messages (Russian) ────────────────────────────────

const DESIGN_PENDING_RU = [
  "⏳ Нейросеть взяла кисточку и начала рисовать. Скинем результат, как только шедевр будет готов.",
  "🎨 Картинка в работе! Нейросеть старается. Иногда даже высовывает язык от усердия. Пришлём, как будет готово.",
  "🖼 Генерируем картинку. Да, мы тоже хотим посмотреть, что получится. Ждём вместе с вами.",
  "⏳ Нейросеть приняла заказ и ушла творить. Не переживайте — она не прокрастинирует. Обычно.",
  "🚀 Запрос улетел, картинка на подходе. Пока ждёте — можете моргнуть. Но не слишком долго, а то пропустите.",
  "🎬 Тишина на площадке! Нейросеть генерирует ваш кадр. Как только скажет «снято» — сразу пришлём.",
];

function pickDesignPending(ctx: BotContext): string {
  if (ctx.user?.language === "ru") {
    return DESIGN_PENDING_RU[Math.floor(Math.random() * DESIGN_PENDING_RU.length)];
  }
  return ctx.t.design.asyncPending;
}

// ── Sync image delivery (mirrors image.processor.ts logic) ───────────────────

const PHOTO_MAX_URL = 5 * 1024 * 1024;
const PHOTO_MAX_BUFFER = 10 * 1024 * 1024;
const DOC_MAX_URL = 20 * 1024 * 1024;
const DOC_MAX_BUFFER = 50 * 1024 * 1024;

async function resolveSyncSource(
  s3Key: string | undefined,
  imageUrl: string,
  filename: string,
): Promise<{ source: string | InstanceType<typeof InputFile>; byteSize: number }> {
  if (s3Key) {
    const s3Url = await getFileUrl(s3Key).catch(() => null);
    if (s3Url) {
      const head = await fetch(s3Url, { method: "HEAD" }).catch(() => null);
      if (head?.ok) {
        const contentLength = head.headers.get("content-length");
        const byteSize = contentLength ? parseInt(contentLength, 10) : NaN;
        if (!isNaN(byteSize) && byteSize > 0) {
          return { source: s3Url, byteSize };
        }
      }
      // HEAD missing or no Content-Length — fall through to download for exact size
    }
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { source: new InputFile(buffer, filename), byteSize: buffer.byteLength };
}

async function sendSyncImageResult(
  ctx: BotContext,
  modelId: string,
  result: SubmitImageResult,
  caption: string,
): Promise<void> {
  const { imageUrl, filename = "image.png", s3Key, dbJobId, assistantMessageId } = result;
  if (!imageUrl) return;

  const model = AI_MODELS[modelId];
  const userId = ctx.user!.id;

  const { source, byteSize } = await resolveSyncSource(s3Key, imageUrl, filename);

  const isUrl = typeof source === "string";
  const photoMax = isUrl ? PHOTO_MAX_URL : PHOTO_MAX_BUFFER;
  const docMax = isUrl ? DOC_MAX_URL : DOC_MAX_BUFFER;
  const isSvg = filename.endsWith(".svg");
  const useDocument = isSvg || byteSize > photoMax;
  const tooLarge = byteSize > docMax;

  // Build keyboard
  const kb = new InlineKeyboard();
  if (model?.supportsImages && assistantMessageId) {
    kb.text(ctx.t.design.refine, `design_ref_${assistantMessageId}`).row();
  }
  if (s3Key && config.api.publicUrl) {
    kb.url(
      ctx.t.common.downloadFile,
      `${config.api.publicUrl}/download/${generateDownloadToken(s3Key, userId.toString())}`,
    );
  } else {
    kb.text(ctx.t.common.sendOriginal, `orig_${dbJobId}`);
  }

  if (tooLarge) {
    await ctx.reply(`${caption}\n\n${ctx.t.errors.fileTooLargeForTelegram}`, {
      reply_markup: kb,
    });
  } else if (useDocument) {
    await ctx.replyWithDocument(source, { caption, reply_markup: kb });
  } else {
    await ctx.replyWithPhoto(source, { caption, reply_markup: kb });
  }
}

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
    const costLine = buildCostLine(model, modelSettings, ctx.t);
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.design.management,
          `${webappUrl}?page=management&section=design`,
        )
      : undefined;
    const { name: modelName, description: modelDesc } = resolveModelDisplay(
      modelId,
      ctx.user.language,
      model,
    );
    await ctx.reply(`🎨 ${modelName}\n\n${modelDesc}\n\n${costLine}`, {
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
  await ctx.deleteMessage().catch(() => void 0);
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
  await ctx.deleteMessage().catch(() => void 0);
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
  const pendingMsg = await ctx.reply(pickDesignPending(ctx));

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

    const model = AI_MODELS[modelId];

    if (!result.isPending && result.imageUrl) {
      const caption = `${model.name ?? modelId}: ${prompt.slice(0, 200)}${sourceImageUrl ? ` ${ctx.t.design.withReference}` : ""}`;
      await sendSyncImageResult(ctx, modelId, result, caption);
    } else {
      // Async — worker will notify when done
      await ctx.reply(pickDesignPending(ctx));
    }
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else if (err instanceof UserFacingError) {
      await ctx.reply(resolveUserFacingError(err, ctx.t.errors));
    } else {
      logger.error(err, "Design message error");
      await ctx.reply(ctx.t.design.generationFailed);
    }
  }
}

// ── Incoming photo or image document in DESIGN_ACTIVE state — set as reference ─

/**
 * Media-group (album) dedup: Telegram delivers each photo of an album as a
 * separate update sharing the same `media_group_id`. Only one of them carries
 * the caption. We only generate once per group — using the first photo that
 * arrives with a caption (or simply the first photo if none has one).
 */
type DesignMediaGroupEntry = {
  timer: ReturnType<typeof setTimeout>;
  processed: boolean;
};
const designMediaGroupBuffer = new Map<string, DesignMediaGroupEntry>();

export async function handleDesignPhoto(ctx: BotContext): Promise<void> {
  const isPhoto = !!ctx.message?.photo;
  const isImageDoc =
    !!ctx.message?.document && ctx.message.document.mime_type?.startsWith("image/");
  if (!ctx.user || (!isPhoto && !isImageDoc)) return;

  // Deduplicate album messages — only the first photo-with-caption (or the first
  // one overall, after a short buffering window) is processed.
  const mediaGroupId = ctx.message?.media_group_id;
  if (mediaGroupId) {
    const key = `${ctx.user.id}__${mediaGroupId}`;
    const hasCaption = !!ctx.message?.caption?.trim();
    const existing = designMediaGroupBuffer.get(key);

    if (existing?.processed) {
      // Another photo from the same album already triggered the generation — ignore.
      return;
    }

    if (existing) {
      clearTimeout(existing.timer);
    }

    if (hasCaption) {
      // This is the captioned photo — mark the group as processed and fall through.
      designMediaGroupBuffer.set(key, {
        processed: true,
        timer: setTimeout(() => designMediaGroupBuffer.delete(key), 10_000),
      });
    } else {
      // No caption yet — buffer briefly. If nothing else arrives, we'll treat this
      // as a plain reference. If a captioned sibling arrives, it will take over.
      designMediaGroupBuffer.set(key, {
        processed: false,
        timer: setTimeout(() => designMediaGroupBuffer.delete(key), 10_000),
      });
      return; // skip non-captioned siblings entirely
    }
  }

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

  // Resolve file_id: highest-res photo or image document
  const fileId = isPhoto ? ctx.message!.photo!.at(-1)!.file_id : ctx.message!.document!.file_id;
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;

  // Save as a user message with mediaUrl
  const msg = await dialogService.saveMessage(dialogId, "user", ctx.t.design.photoAsReference, {
    mediaUrl: fileUrl,
    mediaType: "image",
  });

  // If photo came with a caption, treat it as a prompt and generate immediately
  const caption = ctx.message.caption?.trim();
  if (caption) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const imageSettings = await userStateService.getImageSettings(ctx.user.id);
    const aspectRatio = imageSettings[modelId]?.aspectRatio;
    const pendingMsg = await ctx.reply(pickDesignPending(ctx));

    try {
      const result = await generationService.submitImage({
        userId: ctx.user.id,
        modelId,
        prompt: caption,
        sourceImageUrl: fileUrl,
        telegramChatId: chatId,
        dialogId,
        sendOriginalLabel: ctx.t.common.sendOriginal,
        aspectRatio,
      });

      await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

      if (!result.isPending && result.imageUrl) {
        const captionText = `🎨 ${caption.slice(0, 200)} ${ctx.t.design.withReference}`;
        await sendSyncImageResult(ctx, modelId, result, captionText);
      } else {
        await ctx.reply(pickDesignPending(ctx));
      }
    } catch (err: unknown) {
      await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
      if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
        await replyInsufficientTokens(ctx);
      } else if (err instanceof UserFacingError) {
        await ctx.reply(resolveUserFacingError(err, ctx.t.errors));
      } else {
        logger.error(err, "Design photo+caption error");
        await ctx.reply(ctx.t.design.generationFailed);
      }
    }
    return;
  }

  // No caption — save as ref and ask user to type a prompt
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
  await ctx.answerCallbackQuery();
  await userStateService.setState(ctx.user.id, "DESIGN_ACTIVE");

  const webappUrl = config.bot.webappUrl;
  const token = webappUrl ? generateWebToken(ctx.user.id, config.bot.token) : "";
  const managementBtn = webappUrl
    ? {
        text: ctx.t.design.management,
        web_app: { url: `${webappUrl}?page=management&section=design&wtoken=${token}` },
      }
    : { text: ctx.t.design.management };

  await ctx.reply(ctx.t.design.photoSaved, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.design.chooseModel }],
        [managementBtn],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
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
  await ctx.reply(ctx.t.design.sectionTooltip, {
    reply_markup: buildDesignModelKeyboard(state?.designModelId),
  });
}
