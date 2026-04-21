import type { BotContext } from "../types/context.js";
import {
  dialogService,
  generationService,
  userStateService,
  userAvatarService,
  describeImageForPrompt,
  probeImageMetadata,
} from "@metabox/api/services";
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
import { transcribeAndReply } from "../utils/voice-transcribe.js";
import {
  setActiveSlot,
  getActiveSlot,
  clearActiveSlot,
  buildMediaInputStatusMenu,
  resolveMediaInputUrls,
  debounceSlotReply,
  buildTgSlotValue,
  TG_DOWNLOAD_LIMIT_BYTES,
  sendSlotPreview,
  validateMediaAgainstSlot,
} from "../utils/media-input-state.js";

// ── Random design pending messages (Russian) ────────────────────────────────

const DESIGN_PENDING_RU = [
  "⏳ Нейросеть взяла кисточку и начала рисовать. Скинем результат, как только шедевр будет готов.",
  "🎨 Картинка в работе! Нейросеть старается. Иногда даже высовывает язык от усердия. Пришлём, как будет готово.",
  // "🖼 Генерируем картинку. Да, мы тоже хотим посмотреть, что получится. Ждём вместе с вами.",
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

export async function activateDesignModel(
  ctx: BotContext,
  modelId: string,
  options: { suppressKeyboard?: boolean; sectionReplyKeyboard?: boolean } = {},
): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "DESIGN_ACTIVE", "design");
  await userStateService.setModelForSection(ctx.user.id, "design", modelId);
  // Media-input slots persist per-model; not cleared on activation.
  clearActiveSlot(ctx.user.id);

  const model = AI_MODELS[modelId];
  if (model) {
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const modelSettings = allSettings[modelId] ?? {};
    const costLine = buildCostLine(model, modelSettings, ctx.t);
    const webappUrl = config.bot.webappUrl;
    const kb = new InlineKeyboard();

    if (!options.suppressKeyboard) {
      // Add media input slot buttons (with progressive element reveal)
      if (model.mediaInputs?.length) {
        const filledInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
        const { kb: slotsKb } = buildMediaInputStatusMenu(
          model.mediaInputs,
          filledInputs,
          "design",
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

      if (webappUrl) {
        kb.webApp(ctx.t.design.management, `${webappUrl}?page=management&section=design`);
      }
    }

    const { name: modelName, description: modelDesc } = resolveModelDisplay(
      modelId,
      ctx.user.language,
      model,
    );
    let replyMarkup: Parameters<typeof ctx.reply>[1] extends infer R
      ? R extends { reply_markup?: infer M }
        ? M | undefined
        : never
      : never = kb.inline_keyboard.length ? kb : undefined;
    if (!replyMarkup && options.sectionReplyKeyboard) {
      const token = webappUrl ? generateWebToken(ctx.user.id, config.bot.token) : "";
      const managementBtn = webappUrl
        ? {
            text: ctx.t.design.management,
            web_app: { url: `${webappUrl}?page=management&section=design&wtoken=${token}` },
          }
        : { text: ctx.t.design.management };
      replyMarkup = {
        keyboard: [
          [{ text: ctx.t.design.chooseModel }],
          [managementBtn],
          [{ text: ctx.t.common.backToMain }],
        ],
        resize_keyboard: true,
        is_persistent: true,
      };
    }
    await ctx.reply(`🎨 ${modelName}\n\n${modelDesc}\n\n${costLine}\n\n${ctx.t.voice.inputHint}`, {
      reply_markup: replyMarkup,
    });
  } else {
    await ctx.reply(`${ctx.t.design.modelActivated}\n\n${ctx.t.voice.inputHint}`);
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

// ── Media input status menu helper ──────────────────────────────────────────

/** Sends an updated media-input status menu showing filled/empty slots. */
export async function sendDesignMediaInputStatus(
  ctx: BotContext,
  options: { edit?: boolean } = {},
): Promise<void> {
  if (!ctx.user) return;
  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";
  const model = AI_MODELS[modelId];
  if (!model?.mediaInputs?.length) return;

  const filledInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const { text, kb } = buildMediaInputStatusMenu(model.mediaInputs, filledInputs, "design", ctx.t, {
    promptOptional: model.promptOptional,
    promptOptionalRequiresMedia: model.promptOptionalRequiresMedia,
  });
  const webappUrl = config.bot.webappUrl;
  if (webappUrl) {
    kb.webApp(ctx.t.design.management, `${webappUrl}?page=management&section=design`);
  }
  const body = text || ctx.t.mediaInput.doneUploading;
  if (options.edit) {
    await ctx.editMessageText(body, { reply_markup: kb }).catch(() => void 0);
  } else {
    await ctx.reply(body, { reply_markup: kb });
  }
}

// ── Media input slot callback (mi:design:{slotKey}) ─────────────────────────

/** Sends the upload-prompt message with cancel button for a design slot. */
async function sendDesignSlotUploadPrompt(
  ctx: BotContext,
  slot: NonNullable<(typeof AI_MODELS)[string]["mediaInputs"]>[number],
  modelId: string,
): Promise<void> {
  setActiveSlot(ctx.user!.id, {
    slotKey: slot.slotKey,
    modelId,
    maxImages: slot.maxImages ?? 1,
    section: "design",
  });

  const label = ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
  const maxImages = slot.maxImages ?? 1;
  const msg =
    maxImages > 1
      ? ctx.t.mediaInput.uploadPromptMulti
          .replace("{slot}", String(label))
          .replace("{max}", String(maxImages))
      : ctx.t.mediaInput.uploadPrompt.replace("{slot}", String(label));
  const kb = new InlineKeyboard().text(ctx.t.mediaInput.cancel, `mi_cancel:design`);
  await ctx.reply(msg, { reply_markup: kb });
}

export async function handleDesignMediaInput(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = ctx.callbackQuery?.data ?? "";
  const slotKey = data.replace("mi:design:", "");
  await ctx.answerCallbackQuery();

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";
  const model = AI_MODELS[modelId];
  const slot = model?.mediaInputs?.find((s) => s.slotKey === slotKey);
  if (!slot) return;

  const filled = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const existing = filled[slotKey] ?? [];
  const maxImages = slot.maxImages ?? 1;

  if (existing.length) {
    // Drop the menu message we tapped, send preview, then either resume upload or re-show menu.
    await ctx.deleteMessage().catch(() => void 0);
    await sendSlotPreview(ctx, slot, existing);
    if (existing.length < maxImages) {
      await sendDesignSlotUploadPrompt(ctx, slot, modelId);
    } else {
      await sendDesignMediaInputStatus(ctx);
    }
    return;
  }

  // Empty slot → strip keyboard from the menu (keep text in history) and enter upload mode.
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
  await sendDesignSlotUploadPrompt(ctx, slot, modelId);
}

/** Callback for mi_cancel:design — cancel active upload slot. */
export async function handleDesignMediaInputCancel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();
  clearActiveSlot(ctx.user.id);
  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";
  const model = AI_MODELS[modelId];
  if (model?.mediaInputs?.length) {
    await sendDesignMediaInputStatus(ctx, { edit: true });
  } else {
    await ctx.editMessageText(ctx.t.mediaInput.uploadCancelled).catch(() => void 0);
  }
}

/** Callback for mi_done:{slotKey} — user finished uploading multi-image slot. */
export async function handleDesignMediaInputDone(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();
  clearActiveSlot(ctx.user.id);
  await sendDesignMediaInputStatus(ctx, { edit: true });
}

/**
 * Callback for mi_generate:design — start generation without a text prompt.
 * For Higgsfield Soul: describes the uploaded reference image via cheap vision LLM
 * and uses that description as the prompt (token cost deducted from user).
 */
export async function handleDesignGenerateNoPrompt(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";
  const filled = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const firstFilled = Object.values(filled).find((v) => v?.length);

  if (!firstFilled?.length) {
    await executeDesignPrompt(ctx, "");
    return;
  }

  const resolved = await resolveMediaInputUrls({ ref: [firstFilled[0]] }).catch(() => null);
  const refUrl = resolved?.ref?.[0];
  if (!refUrl) {
    await ctx.reply(ctx.t.errors.soulDescribeFailed);
    return;
  }

  const pendingMsg = await ctx.reply(ctx.t.errors.soulDescribingReference);
  let description: string;
  try {
    description = await describeImageForPrompt(ctx.user.id, refUrl, modelId);
  } catch (err) {
    logger.error(err, "describeImageForPrompt failed");
    await ctx.api.deleteMessage(ctx.chat!.id, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(ctx.t.errors.soulDescribeFailed);
    return;
  }
  await ctx.api.deleteMessage(ctx.chat!.id, pendingMsg.message_id).catch(() => void 0);
  await executeDesignPrompt(ctx, description);
}

/** Callback for mi_remove:design:{slotKey} — clear a filled slot. */
export async function handleDesignMediaInputRemove(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = ctx.callbackQuery?.data ?? "";
  const slotKey = data.replace("mi_remove:design:", "");
  await ctx.answerCallbackQuery();
  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";
  await userStateService.clearMediaInputSlot(ctx.user.id, modelId, slotKey);
  await sendDesignMediaInputStatus(ctx, { edit: true });
}

// ── Incoming prompt in DESIGN_ACTIVE state ────────────────────────────────────

/**
 * Executes a text prompt in the active design session.
 * Used by handleDesignMessage (text) and the voice-prompt callback.
 */
export async function executeDesignPrompt(ctx: BotContext, prompt: string): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.designModelId ?? "dall-e-3";
  const model = AI_MODELS[modelId];

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

  // Slot-based media inputs (per-model; cleared for this model after generation start)
  const mediaInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const hasMediaInputs = Object.keys(mediaInputs).length > 0;
  clearActiveSlot(ctx.user.id);

  // Check required slots before proceeding
  if (model?.mediaInputs?.length) {
    for (const slot of model.mediaInputs) {
      if (slot.required && !mediaInputs[slot.slotKey]?.length) {
        const label =
          ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
        await ctx.reply(ctx.t.mediaInput.slotRequired.replace("{slot}", String(label)));
        await sendDesignMediaInputStatus(ctx);
        return;
      }
    }
  }

  // Higgsfield Soul pre-flight: must have a created+selected character avatar.
  if (modelId === "higgsfield-soul") {
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const customRefId = allSettings[modelId]?.custom_reference_id as string | null | undefined;
    const validation = await userAvatarService.validateSoulAvatar(ctx.user.id, customRefId);
    if (validation) {
      await ctx.reply(ctx.t.errors[validation]);
      return;
    }
  }

  // Clear media inputs for this model (consumed on generation start)
  if (hasMediaInputs) await userStateService.clearMediaInputs(ctx.user.id, modelId);

  // Resolve reference image (one-shot, legacy path)
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

  const pendingMsg = await ctx.reply(pickDesignPending(ctx));

  try {
    await generationService.submitImage({
      userId: ctx.user.id,
      modelId,
      prompt,
      sourceImageUrl,
      mediaInputs: hasMediaInputs ? await resolveMediaInputUrls(mediaInputs) : undefined,
      telegramChatId: chatId,
      dialogId,
      sendOriginalLabel: ctx.t.common.sendOriginal,
      aspectRatio,
    });
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

export async function handleDesignMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  await executeDesignPrompt(ctx, ctx.message.text);
}

export async function handleDesignVoice(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await transcribeAndReply(ctx, "design");
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
  // Exception: when a slot is active, every photo from the album is processed
  // individually so that all images land in the slot.
  const activeSlotForDedup = getActiveSlot(ctx.user.id);
  const mediaGroupId = ctx.message?.media_group_id;
  if (mediaGroupId && !activeSlotForDedup) {
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
  const model = AI_MODELS[modelId];

  // Resolve file_id + size from message — without calling getFile.
  // file_id is durable (no TTL) and stored in slots as `tg:{kind}:{id}`.
  const photoSize = isPhoto ? ctx.message!.photo!.at(-1)! : null;
  const docFile = isImageDoc ? ctx.message!.document! : null;
  const fileId = (photoSize?.file_id ?? docFile!.file_id) as string;
  const fileSize = photoSize?.file_size ?? docFile?.file_size ?? 0;
  const tgKind: "photo" | "doc" = photoSize ? "photo" : "doc";

  // Bot API can't download files >20 MB at all → reject early.
  if (fileSize > TG_DOWNLOAD_LIMIT_BYTES) {
    await ctx.reply(ctx.t.errors.fileTooLargeForBotApi);
    return;
  }

  const caption = ctx.message.caption?.trim();
  const tgSlotValue = buildTgSlotValue(tgKind, fileId);

  // Lazily resolve the live download URL only when a path actually needs the
  // bytes during this request (caption+photo legacy flow below).
  let cachedTgUrl: string | null = null;
  const getLiveTgUrl = async (): Promise<string> => {
    if (cachedTgUrl) return cachedTgUrl;
    const file = await ctx.api.getFile(fileId);
    cachedTgUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
    return cachedTgUrl;
  };

  // ── Slot-based upload (new path) ──────────────────────────────────────────
  const activeSlot = getActiveSlot(ctx.user.id);
  if (activeSlot && activeSlot.section === "design") {
    const slotModelId = activeSlot.modelId;
    const slot = model?.mediaInputs?.find((s) => s.slotKey === activeSlot.slotKey);

    if (slot?.constraints) {
      let widthPx = photoSize?.width;
      let heightPx = photoSize?.height;
      let fileSizeBytes: number | undefined = fileSize || undefined;
      if (isImageDoc) {
        try {
          const probeUrl = await getLiveTgUrl();
          const meta = await probeImageMetadata(probeUrl);
          widthPx = meta.width;
          heightPx = meta.height;
          fileSizeBytes = meta.fileSizeBytes;
        } catch (err) {
          logger.warn({ err }, "probeImageMetadata failed for document");
          await ctx.reply(ctx.t.errors.mediaSlotReadMetadataFailed);
          return;
        }
      }
      const violation = validateMediaAgainstSlot(slot, { widthPx, heightPx, fileSizeBytes }, ctx.t);
      if (violation) {
        await ctx.reply(violation);
        return;
      }
    }

    const current = await userStateService.getMediaInputs(ctx.user.id, slotModelId);
    const existing = current[activeSlot.slotKey] ?? [];
    const userId = ctx.user.id;
    if (existing.length >= activeSlot.maxImages) {
      // Single-image slot: replace existing. Multi-image slot: drop overflow
      // silently (an album larger than maxImages shouldn't wipe earlier items).
      if (activeSlot.maxImages === 1) {
        await userStateService.clearMediaInputSlot(userId, slotModelId, activeSlot.slotKey);
        await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
      }
    } else {
      await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
    }

    const label = slot
      ? (ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey)
      : activeSlot.slotKey;

    debounceSlotReply(userId, mediaGroupId, async () => {
      const freshInputs = await userStateService.getMediaInputs(userId, slotModelId);
      const freshCount = freshInputs[activeSlot.slotKey]?.length ?? 0;

      if (activeSlot.maxImages === 1 || freshCount >= activeSlot.maxImages) {
        clearActiveSlot(userId);
        await sendDesignMediaInputStatus(ctx);
      } else {
        const msg = ctx.t.mediaInput.imageSaved
          .replace("{slot}", String(label))
          .replace("{n}", String(freshCount))
          .replace("{max}", String(activeSlot.maxImages));
        const kb = new InlineKeyboard().text(
          ctx.t.mediaInput.doneUploading,
          `mi_done:${activeSlot.slotKey}`,
        );
        await ctx.reply(msg, { reply_markup: kb });
      }

      if (caption) {
        await executeDesignPrompt(ctx, caption);
      }
    });
    return;
  }

  // ── Auto-slot: no active slot, but model has mediaInputs → save to first slot ─
  if (!caption && model?.mediaInputs?.length) {
    const current = await userStateService.getMediaInputs(ctx.user.id, modelId);
    const targetSlot =
      model.mediaInputs.find((s) => !current[s.slotKey]?.length) ?? model.mediaInputs[0];
    let overflow = false;
    if (
      current[targetSlot.slotKey]?.length &&
      (!targetSlot.maxImages || targetSlot.maxImages === current[targetSlot.slotKey]?.length)
    ) {
      overflow = true;
    }
    await userStateService.addMediaInput(
      ctx.user.id,
      modelId,
      targetSlot.slotKey,
      tgSlotValue,
      overflow,
    );
    await sendDesignMediaInputStatus(ctx);
    return;
  }

  // Below paths (legacy dialog reference + caption+photo) need the live URL.
  const fileUrl = await getLiveTgUrl();

  // ── Legacy path: dialog-based reference ───────────────────────────────────
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

  // Save as a user message with mediaUrl
  const dialogMsg = await dialogService.saveMessage(
    dialogId,
    "user",
    ctx.t.design.photoAsReference,
    {
      mediaUrl: fileUrl,
      mediaType: "image",
    },
  );

  // If photo came with a caption, treat it as a prompt and generate immediately
  if (caption) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // If model has media input slots, save the photo to the first slot
    let mediaInputs: Record<string, string[]> | undefined;
    if (model?.mediaInputs?.length) {
      const firstSlot = model.mediaInputs[0];
      mediaInputs = { [firstSlot.slotKey]: [fileUrl] };
    }

    const imageSettings = await userStateService.getImageSettings(ctx.user.id);
    const aspectRatio = imageSettings[modelId]?.aspectRatio;
    const pendingMsg = await ctx.reply(pickDesignPending(ctx));

    try {
      await generationService.submitImage({
        userId: ctx.user.id,
        modelId,
        prompt: caption,
        sourceImageUrl: fileUrl,
        mediaInputs,
        telegramChatId: chatId,
        dialogId,
        sendOriginalLabel: ctx.t.common.sendOriginal,
        aspectRatio,
      });
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
  await userStateService.setDesignRefMessage(ctx.user.id, dialogMsg.id);
  await ctx.reply(ctx.t.design.photoSaved);
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
