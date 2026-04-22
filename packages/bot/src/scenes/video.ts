import type { BotContext } from "../types/context.js";
import {
  videoGenerationService,
  userStateService,
  // userUploadsService,
  userAvatarService,
  s3Service,
  calculateCost,
  checkBalance,
  deductTokens,
  usdToTokens,
  probeImageMetadata,
} from "@metabox/api/services";
import { probeVideoMetadata } from "@metabox/api/utils/mp4-duration";
import { buildCostLine } from "../utils/cost-line.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";
import { ElevenLabsAdapter } from "@metabox/api/ai/audio";
import { getAvatarQueue } from "@metabox/api/queues";
import {
  MODELS_BY_SECTION,
  FAMILIES_BY_SECTION,
  MODEL_TO_FAMILY,
  AI_MODELS,
  config,
  resolveModelDisplay,
  generateWebToken,
  getResolvedModes,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";
import {
  transcribeAndReply,
  storeTranscription as storeVoiceText,
} from "../utils/voice-transcribe.js";
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
  pickAutoSlot,
  trackDistribution,
  consumeDistribution,
  buildOverflowMessage,
  buildSlotUploadedMessage,
  buildModePickerMenu,
  getActiveModelSlots,
  findMissingRequiredSlot,
} from "../utils/media-input-state.js";
import {
  SOUL_MAX_PHOTOS,
  SOUL_MIN_PHOTOS,
  getSoulBuffer,
  addSoulPhoto,
  clearSoulBuffer,
  debounceSoulReply,
} from "../utils/soul-photo-buffer.js";
import { acquireLock, releaseLock } from "../utils/dedup.js";

// ── Avatar voice choice store (TTL 10 min) ──────────────────────────────────

interface AvatarVoiceEntry {
  uploadedKey: string | null;
  tgUrl: string;
  expiresAt: number;
}

const avatarVoiceStore = new Map<string, AvatarVoiceEntry>();

function storeAvatarVoice(
  userId: bigint,
  id: string,
  entry: Omit<AvatarVoiceEntry, "expiresAt">,
): void {
  avatarVoiceStore.set(`${userId}:${id}`, { ...entry, expiresAt: Date.now() + 10 * 60 * 1000 });
}

function getAvatarVoice(userId: bigint, id: string): AvatarVoiceEntry | null {
  const key = `${userId}:${id}`;
  const entry = avatarVoiceStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    avatarVoiceStore.delete(key);
    return null;
  }
  return entry;
}

// ── Random video pending messages (Russian) ──────────────────────────────────

const VIDEO_PENDING_RU = [
  "⏳ Монтаж в процессе. Нейросеть режет, клеит и добавляет магии. Пару минут — и скинем результат.",
  "🎥 Ваше видео в производстве. Бюджет — ноль, ожидание — пара минут, результат — бесценен. Пришлём, как будет готово.",
  "🪄 Нейросеть взяла камеру и ушла на съёмочную площадку. Обычно укладывается в несколько минут. Ждём вместе.",
  "🧠 Миллиарды нейронов сейчас рендерят ваше видео. Это займёт пару минут — но оно того стоит. Сразу скинем.",
  "🚀 Запрос принят, рендер запущен. Пока ждёте — можно успеть налить чай. Видео прилетит, как только будет готово.",
  "🎬 Тссс, идёт съёмка! Нейросеть работает над вашим видео. Несколько минут — и отправим вам готовый ролик. Без рекламы, обещаем.",
];

function pickVideoPending(ctx: BotContext): string {
  if (ctx.user?.language === "ru") {
    return VIDEO_PENDING_RU[Math.floor(Math.random() * VIDEO_PENDING_RU.length)];
  }
  return ctx.t.video.asyncPending;
}

// ── ElevenLabs TTS pre-generation for lip-sync ────────────────────────────────

const AVATAR_MODELS = new Set(["heygen", "d-id"]);

/**
 * If the video model uses an ElevenLabs voice (voice_provider === "elevenlabs")
 * and no raw audio override is present, synthesises the prompt via ElevenLabs TTS,
 * uploads to S3, deducts TTS tokens, and returns the S3 key.
 * Returns null when TTS pre-generation is not needed.
 */
async function preGenerateELTts(
  userId: bigint,
  modelId: string,
  prompt: string,
  videoModelSettings: Record<string, unknown>,
  rawVoiceOverride: string | undefined,
): Promise<string | null> {
  if (!AVATAR_MODELS.has(modelId)) return null;
  if (rawVoiceOverride) return null; // raw audio takes priority
  if (videoModelSettings.voice_s3key as string | undefined) return null;

  const voiceId = videoModelSettings.voice_id as string | undefined;
  const voiceProvider = videoModelSettings.voice_provider as string | undefined;
  if (!voiceId || voiceProvider !== "elevenlabs") return null;

  const ttsModel = AI_MODELS["tts-el"];
  if (!ttsModel) return null;

  // Get user's tts-el settings (model_id, stability, etc.) and override voice_id
  const allSettings = await userStateService.getModelSettings(userId);
  const ttsSettings: Record<string, unknown> = {
    ...(allSettings["tts-el"] ?? {}),
    voice_id: voiceId,
  };

  // Check balance for TTS before generating
  const ttsCost = calculateCost(
    ttsModel,
    0,
    0,
    undefined,
    undefined,
    ttsSettings,
    undefined,
    prompt.length,
  );
  await checkBalance(userId, ttsCost);

  // Generate TTS
  const adapter = new ElevenLabsAdapter("tts-el");
  const result = await adapter.generate({ prompt, modelSettings: ttsSettings });
  if (!result.buffer) return null;

  // Upload to S3
  const s3Key = `voice/el/${userId.toString()}/${Date.now()}.mp3`;
  const uploadedKey = await s3Service
    .uploadBuffer(s3Key, result.buffer, "audio/mpeg")
    .catch(() => null);
  if (!uploadedKey) {
    logger.warn(
      { userId, modelId },
      "EL TTS generated but S3 upload failed — falling back to no TTS audio",
    );
    return null;
  }

  // Deduct TTS tokens
  await deductTokens(userId, ttsCost, "tts-el");

  return uploadedKey;
}

// ── Model selection keyboard ──────────────────────────────────────────────────

/**
 * Builds the video-section keyboard preserving MODELS_BY_SECTION order.
 * Family members are collapsed into one button at the position of the first member.
 */
export function buildVideoModelKeyboard(savedModelId?: string | null): InlineKeyboard {
  const allModels = MODELS_BY_SECTION["video"] ?? [];
  const families = FAMILIES_BY_SECTION["video"] ?? [];
  const familyById = new Map(families.map((f) => [f.id, f]));
  const kb = new InlineKeyboard();

  const rows: Array<[string, string]> = [];
  const addedFamilies = new Set<string>();

  for (const m of allModels) {
    const familyId = MODEL_TO_FAMILY[m.id];
    if (familyId) {
      if (addedFamilies.has(familyId)) continue;
      addedFamilies.add(familyId);
      const family = familyById.get(familyId)!;
      const memberIds = new Set(family.members.map((fm) => fm.modelId));
      const modelId =
        savedModelId && memberIds.has(savedModelId) ? savedModelId : family.defaultModelId;
      rows.push([family.name, `video_family_${family.id}__${modelId}`]);
    } else {
      rows.push([m.name, `video_model_${m.id}`]);
    }
  }

  for (let i = 0; i < rows.length; i += 2) {
    kb.text(rows[i][0], rows[i][1]);
    if (rows[i + 1]) kb.text(rows[i + 1][0], rows[i + 1][1]);
    kb.row();
  }
  return kb;
}

// ── Model activation (shared logic) ──────────────────────────────────────────

export async function activateVideoModel(
  ctx: BotContext,
  modelId: string,
  options: { suppressKeyboard?: boolean; sectionReplyKeyboard?: boolean } = {},
): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_ACTIVE", "video");
  await userStateService.setModelForSection(ctx.user.id, "video", modelId);
  // Media-input slots persist per-model; not cleared on activation.
  clearActiveSlot(ctx.user.id);

  const model = AI_MODELS[modelId];
  if (model) {
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const modelSettings = allSettings[modelId] ?? {};
    const defaultDuration =
      (modelSettings.duration as number | undefined) ??
      model.supportedDurations?.[0] ??
      model.durationRange?.min ??
      5;
    const costLine = buildCostLine(model, modelSettings, ctx.t, defaultDuration);
    const webappUrl = config.bot.webappUrl;
    const kb = new InlineKeyboard();

    const modes = getResolvedModes(model);

    if (!options.suppressKeyboard && !modes) {
      // Legacy single-mode behavior — slot keyboard goes on the hint message.
      if (model.mediaInputs?.length) {
        const filledInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
        const { kb: slotsKb } = buildMediaInputStatusMenu(
          model.mediaInputs,
          filledInputs,
          "video",
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
        kb.webApp(ctx.t.video.management, `${webappUrl}?page=management&section=video`);
      }
    }

    const { name: modelName, description: modelDesc } = resolveModelDisplay(
      modelId,
      ctx.user.language,
      model,
    );
    const inlineKb = kb.inline_keyboard.length ? kb : undefined;
    let sectionReplyMarkup:
      | {
          keyboard: { text: string; web_app?: { url: string } }[][];
          resize_keyboard: boolean;
          is_persistent: boolean;
        }
      | undefined;
    if (options.sectionReplyKeyboard) {
      const token = webappUrl ? generateWebToken(ctx.user.id, config.bot.token) : "";
      const managementBtn = webappUrl
        ? {
            text: ctx.t.video.management,
            web_app: { url: `${webappUrl}?page=management&section=video&wtoken=${token}` },
          }
        : { text: ctx.t.video.management };
      sectionReplyMarkup = {
        keyboard: [
          [{ text: ctx.t.video.newDialog }],
          [{ text: ctx.t.video.avatars }, { text: ctx.t.video.lipSync }],
          [managementBtn],
          [{ text: ctx.t.common.backToMain }],
        ],
        resize_keyboard: true,
        is_persistent: true,
      };
    }

    // Description goes first; attach the persistent section reply keyboard here
    // (if any), so the inline model menu can live on the final hint message.
    await ctx.reply(`${modelName}\n\n${modelDesc}\n\n${costLine}`, {
      reply_markup: sectionReplyMarkup,
    });

    let hint = ctx.t.video.hintVideoDefault;
    let appendVoiceHint = true;
    switch (modelId) {
      case "heygen":
        hint = ctx.t.video.hintHeygen;
        appendVoiceHint = false; // avatar hints already mention voice
        break;
      case "d-id":
        hint = ctx.t.video.hintDid;
        appendVoiceHint = false;
        break;
      case "higgsfield-lite":
      case "higgsfield":
      case "higgsfield-preview":
        hint = ctx.t.video.hintHiggsfield;
    }
    await ctx.reply(appendVoiceHint ? `${hint}\n\n${ctx.t.voice.inputHint}` : hint, {
      reply_markup: modes ? undefined : inlineKb,
    });

    // For modes-aware models, send a mode picker. The picker click handler
    // (`mode:` callback) will follow up with the mode-activated message and
    // the filtered slot keyboard. If the user already has a saved mode for
    // this model, send the mode-activated message directly instead.
    if (modes && !options.suppressKeyboard) {
      await sendVideoModePicker(ctx, modelId, modes);
    }
  } else {
    await ctx.reply(ctx.t.video.modelActivated);
  }
}

/** Send the mode picker message — one button per mode, two per row. */
async function sendVideoModePicker(
  ctx: BotContext,
  modelId: string,
  modes: readonly { id: string; labelKey: string }[],
): Promise<void> {
  const { text, kb } = buildModePickerMenu(modes, "video", modelId, ctx.t);
  await ctx.reply(text, { reply_markup: kb });
}

// ── Model selected via inline callback ───────────────────────────────────────

export async function handleVideoModelSelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const modelId = ctx.callbackQuery?.data?.replace("video_model_", "") ?? "";
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => void 0);
  await activateVideoModel(ctx, modelId);
}

/**
 * Family button tapped: data format is `video_family_{familyId}__{modelId}`
 */
export async function handleVideoFamilySelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = ctx.callbackQuery?.data ?? "";
  const modelId = data.split("__")[1] ?? "";
  if (!modelId || !AI_MODELS[modelId] || !MODEL_TO_FAMILY[modelId]) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => void 0);
  await activateVideoModel(ctx, modelId);
}

// ── Media input status menu helper ──────────────────────────────────────────

/** Sends an updated media-input status menu showing filled/empty slots. */
export async function sendVideoMediaInputStatus(
  ctx: BotContext,
  options: { edit?: boolean; prependText?: string; statusText?: string } = {},
): Promise<void> {
  if (!ctx.user) return;
  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";
  const model = AI_MODELS[modelId];
  if (!model?.mediaInputs?.length) return;

  const activeSlots = await getActiveModelSlots(ctx.user.id, modelId);
  if (!activeSlots.length) return;
  const filledInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const { text, kb } = buildMediaInputStatusMenu(activeSlots, filledInputs, "video", ctx.t, {
    promptOptional: model.promptOptional,
    promptOptionalRequiresMedia: model.promptOptionalRequiresMedia,
  });
  const webappUrl = config.bot.webappUrl;
  if (webappUrl) {
    kb.webApp(ctx.t.video.management, `${webappUrl}?page=management&section=video`);
  }
  const statusBody = options.statusText ?? (text || ctx.t.mediaInput.doneUploading);
  const body = options.prependText ? `${options.prependText}\n\n${statusBody}` : statusBody;
  if (options.edit) {
    await ctx.editMessageText(body, { reply_markup: kb }).catch(() => void 0);
  } else {
    await ctx.reply(body, { reply_markup: kb });
  }
}

// ── Media input slot callback (mi:video:{slotKey}) ──────────────────────────

/** Sends the upload-prompt message with hint and cancel button for a video slot. */
async function sendVideoSlotUploadPrompt(
  ctx: BotContext,
  slot: NonNullable<(typeof AI_MODELS)[string]["mediaInputs"]>[number],
  modelId: string,
): Promise<void> {
  setActiveSlot(ctx.user!.id, {
    slotKey: slot.slotKey,
    modelId,
    maxImages: slot.maxImages ?? 1,
    section: "video",
  });

  const label = ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
  const maxImages = slot.maxImages ?? 1;
  const isVideoSlot = slot.mode === "motion_video" || slot.mode === "first_clip";
  const msg =
    slot.mode === "reference_element"
      ? ctx.t.mediaInput.uploadPromptElement.replace("{slot}", String(label))
      : isVideoSlot
        ? ctx.t.mediaInput.uploadPromptVideo.replace("{slot}", String(label))
        : maxImages > 1
          ? ctx.t.mediaInput.uploadPromptMulti
              .replace("{slot}", String(label))
              .replace("{max}", String(maxImages))
          : ctx.t.mediaInput.uploadPrompt.replace("{slot}", String(label));
  const kb = new InlineKeyboard().text(ctx.t.mediaInput.cancel, `mi_cancel:video`);
  const isWan = modelId === "wan";
  const isKlingMotion = modelId === "kling-motion" || modelId === "kling-motion-pro";
  const hint =
    isKlingMotion && slot.mode === "reference_element"
      ? ctx.t.mediaInput.motionElementHint
      : isKlingMotion
        ? ctx.t.mediaInput.motionVideoHint
        : slot.mode === "reference_element"
          ? ctx.t.mediaInput.refElementHint
          : slot.mode === "reference_image"
            ? ctx.t.mediaInput.referenceImagesHint
            : slot.mode === "reference_video"
              ? ctx.t.mediaInput.referenceVideosHint
              : slot.mode === "reference_audio"
                ? ctx.t.mediaInput.referenceAudiosHint
                : slot.mode === "driving_audio"
                  ? ctx.t.mediaInput.drivingAudioHint
                  : slot.mode === "first_clip"
                    ? ctx.t.mediaInput.firstClipHint
                    : isWan && slot.mode === "first_frame"
                      ? ctx.t.mediaInput.firstFrameWanHint
                      : isWan && slot.mode === "last_frame"
                        ? ctx.t.mediaInput.lastFrameWanHint
                        : null;
  if (hint) await ctx.reply(hint);
  await ctx.reply(msg, { reply_markup: kb });
}

export async function handleVideoMediaInput(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = ctx.callbackQuery?.data ?? "";
  const slotKey = data.replace("mi:video:", "");
  await ctx.answerCallbackQuery();

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";
  const activeSlots = await getActiveModelSlots(ctx.user.id, modelId);
  const slot = activeSlots.find((s) => s.slotKey === slotKey);
  if (!slot) return;

  const filled = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const existing = filled[slotKey] ?? [];
  const maxImages = slot.maxImages ?? 1;

  if (existing.length) {
    // Drop the menu message we tapped, send preview, then either resume upload or re-show menu.
    await ctx.deleteMessage().catch(() => void 0);
    await sendSlotPreview(ctx, slot, existing);
    if (existing.length < maxImages) {
      await sendVideoSlotUploadPrompt(ctx, slot, modelId);
    } else {
      await sendVideoMediaInputStatus(ctx);
    }
    return;
  }

  // Empty slot → strip keyboard from the menu (keep text in history) and enter upload mode.
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
  await sendVideoSlotUploadPrompt(ctx, slot, modelId);
}

/** Callback for mi_cancel:video — cancel active upload slot. */
export async function handleVideoMediaInputCancel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();
  clearActiveSlot(ctx.user.id);
  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";
  const model = AI_MODELS[modelId];
  if (model?.mediaInputs?.length) {
    await sendVideoMediaInputStatus(ctx, {
      edit: true,
      statusText: ctx.t.mediaInput.uploadCancelled,
    });
  } else {
    await ctx.editMessageText(ctx.t.mediaInput.uploadCancelled).catch(() => void 0);
  }
}

/** Callback for mi_done:{slotKey} — user finished uploading multi-image slot. */
export async function handleVideoMediaInputDone(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();
  clearActiveSlot(ctx.user.id);
  await sendVideoMediaInputStatus(ctx, { edit: true });
}

/** Callback for mi_generate:video — start generation without a text prompt (promptOptional models). */
export async function handleVideoGenerateNoPrompt(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
  await executeVideoPrompt(ctx, "");
}

/** Callback for mi_remove:video:{slotKey} — clear a filled slot. */
export async function handleVideoMediaInputRemove(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = ctx.callbackQuery?.data ?? "";
  const slotKey = data.replace("mi_remove:video:", "");
  await ctx.answerCallbackQuery();

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";

  // For element slots: shift subsequent elements down after removal.
  const elemMatch = slotKey.match(/^ref_element_(\d+)$/);
  if (elemMatch) {
    const removed = parseInt(elemMatch[1], 10);
    const current = await userStateService.getMediaInputs(ctx.user.id, modelId);
    // Clear the removed slot and shift higher-numbered elements down.
    for (let i = removed; i <= 5; i++) {
      const nextKey = `ref_element_${i + 1}`;
      const curKey = `ref_element_${i}`;
      const nextVal = current[nextKey];
      if (nextVal?.length) {
        await userStateService.clearMediaInputSlot(ctx.user.id, modelId, curKey);
        for (const url of nextVal) {
          await userStateService.addMediaInput(ctx.user.id, modelId, curKey, url);
        }
      } else {
        await userStateService.clearMediaInputSlot(ctx.user.id, modelId, curKey);
        break;
      }
    }
  } else {
    await userStateService.clearMediaInputSlot(ctx.user.id, modelId, slotKey);
  }
  await sendVideoMediaInputStatus(ctx, { edit: true });
}

// ── Incoming prompt in VIDEO_ACTIVE state ─────────────────────────────────────

/**
 * Executes a text prompt in the active video session.
 * Used by handleVideoMessage (text) and the voice-prompt callback.
 */
export async function executeVideoPrompt(ctx: BotContext, prompt: string): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";

  const videoSettings = await userStateService.getVideoSettings(ctx.user.id);
  const modelSettings = videoSettings[modelId];

  // Slot-based media inputs (per-model; cleared for this model after generation start)
  const mediaInputs = await userStateService.getMediaInputs(ctx.user.id, modelId);
  const hasMediaInputs = Object.keys(mediaInputs).length > 0;
  clearActiveSlot(ctx.user.id);

  // Check required slots before proceeding (filtered to active mode)
  const activeSlots = await getActiveModelSlots(ctx.user.id, modelId);
  if (activeSlots.length) {
    const missing = findMissingRequiredSlot(modelId, activeSlots, mediaInputs);
    if (missing) {
      const label =
        ctx.t.mediaInput[missing.labelKey as keyof typeof ctx.t.mediaInput] ?? missing.labelKey;
      await ctx.reply(ctx.t.mediaInput.slotRequired.replace("{slot}", String(label)));
      await sendVideoMediaInputStatus(ctx);
      return;
    }
  }

  // Clear media inputs for this model (consumed on generation start)
  if (hasMediaInputs) await userStateService.clearMediaInputs(ctx.user.id, modelId);

  // For D-ID/HeyGen: pick up any previously saved reference photo (one-shot, legacy path)
  const imageUrl = (await userStateService.getAndClearVideoRefImageUrl(ctx.user.id)) ?? undefined;
  // For D-ID: pick up any previously saved driver video URL (one-shot)
  const driverUrl = (await userStateService.getAndClearVideoRefDriverUrl(ctx.user.id)) ?? undefined;
  // For HeyGen/D-ID: pick up any previously saved raw voice recording (one-shot)
  const rawVoiceS3Key =
    (await userStateService.getAndClearVideoRefVoiceUrl(ctx.user.id)) ?? undefined;

  // Resolve full model settings (webapp-saved) for EL TTS check
  const allModelSettings = await userStateService.getModelSettings(ctx.user.id);
  const fullModelSettings = allModelSettings[modelId] ?? {};

  const pendingMsg = await ctx.reply(pickVideoPending(ctx));

  try {
    // If avatar model + EL cloned voice selected + no raw audio override → pre-generate TTS
    let elTtsS3Key: string | null = null;
    if (AVATAR_MODELS.has(modelId) && !rawVoiceS3Key) {
      const voiceProvider = fullModelSettings.voice_provider as string | undefined;
      if (voiceProvider === "elevenlabs") {
        await ctx.api
          .editMessageText(chatId, pendingMsg.message_id, ctx.t.video.elVoiceGenerating)
          .catch(() => void 0);
        elTtsS3Key = await preGenerateELTts(
          ctx.user.id,
          modelId,
          prompt,
          fullModelSettings,
          rawVoiceS3Key,
        );
      }
    }

    await ctx.api
      .editMessageText(chatId, pendingMsg.message_id, pickVideoPending(ctx))
      .catch(() => void 0);

    // Build voice override: raw recording > EL TTS > nothing (adapter uses configured voice_id)
    const effectiveVoiceS3Key = rawVoiceS3Key ?? elTtsS3Key ?? undefined;

    const validationError = videoGenerationService.validateVideoRequest(
      {
        modelId,
        prompt,
        imageUrl,
        aspectRatio: modelSettings?.aspectRatio,
        duration: modelSettings?.duration,
        modelSettings: {
          ...fullModelSettings,
          ...(effectiveVoiceS3Key ? { voice_s3key: effectiveVoiceS3Key } : {}),
        },
        userId: ctx.user.id,
      },
      { hasVoiceFile: !!effectiveVoiceS3Key },
    );
    if (validationError) {
      await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
      await ctx.reply(ctx.t.video[validationError.key as keyof typeof ctx.t.video] as string);
      return;
    }

    await videoGenerationService.submitVideo({
      userId: ctx.user.id,
      modelId,
      prompt,
      imageUrl,
      mediaInputs: hasMediaInputs ? await resolveMediaInputUrls(mediaInputs) : undefined,
      telegramChatId: chatId,
      sendOriginalLabel: ctx.t.common.sendOriginal,
      aspectRatio: modelSettings?.aspectRatio,
      duration: modelSettings?.duration,
      extraModelSettings:
        driverUrl || effectiveVoiceS3Key
          ? {
              ...(driverUrl ? { driver_url: driverUrl } : {}),
              ...(effectiveVoiceS3Key ? { voice_s3key: effectiveVoiceS3Key, voice_url: "" } : {}),
            }
          : undefined,
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(pickVideoPending(ctx));
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else {
      logger.error(err, "Video message error");
      await ctx.reply(ctx.t.video.generationFailed);
    }
  }
}

export async function handleVideoMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  await executeVideoPrompt(ctx, ctx.message.text);
}

// ── New video dialog ──────────────────────────────────────────────────────────

export async function handleNewVideoDialog(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_SECTION", "video");
  const state = await userStateService.get(ctx.user.id);
  await ctx.reply(ctx.t.video.sectionTitle, {
    reply_markup: buildVideoModelKeyboard(state?.videoModelId),
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
    const costLine = buildCostLine(model, modelSettings, ctx.t);
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.video.management,
          `${webappUrl}?page=management&section=video`,
        )
      : undefined;
    const { name: heygenName, description: heygenDesc } = resolveModelDisplay(
      "heygen",
      ctx.user.language,
      model,
    );
    await ctx.reply(`👾 ${heygenName}\n\n${heygenDesc}\n\n${costLine}`, {
      reply_markup: kb,
    });
    await ctx.reply(ctx.t.video.hintHeygen);
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
    const costLine = buildCostLine(model, modelSettings, ctx.t);
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.video.management,
          `${webappUrl}?page=management&section=video`,
        )
      : undefined;
    const { name: didName, description: didDesc } = resolveModelDisplay(
      "d-id",
      ctx.user.language,
      model,
    );
    await ctx.reply(`🔄 ${didName}\n\n${didDesc}\n\n${costLine}`, {
      reply_markup: kb,
    });
    await ctx.reply(ctx.t.video.hintDid);
  }
}

// ── Photo handler in VIDEO_ACTIVE state ───────────────────────────────────────
// HeyGen: saves as avatar_photo UserUpload + auto-selects in modelSettings
// D-ID: saves as one-shot reference image URL

/**
 * Media-group (album) dedup — see design.ts for rationale.
 */
type VideoMediaGroupEntry = { timer: ReturnType<typeof setTimeout>; processed: boolean };
const videoMediaGroupBuffer = new Map<string, VideoMediaGroupEntry>();

export async function handleVideoPhoto(ctx: BotContext): Promise<void> {
  const isPhoto = !!ctx.message?.photo;
  const isImageDoc =
    !!ctx.message?.document && ctx.message.document.mime_type?.startsWith("image/");
  if (!ctx.user || (!isPhoto && !isImageDoc)) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";
  const model = AI_MODELS[modelId];

  // Auto-slot mode (no active slot, model has slots, not an avatar model) wants
  // every sibling in an album to be distributed across slots. Active-slot mode
  // also processes every sibling. Only the legacy "single ref / caption →
  // immediate generate" paths need album dedup.
  const activeSlotForDedup = getActiveSlot(ctx.user.id);
  const isActiveSlotMode = activeSlotForDedup?.section === "video";
  // Slots filtered by the user's selected mode — the auto-distribution path
  // and required-slot lookups must respect mode boundaries.
  const activeModeSlots = await getActiveModelSlots(ctx.user.id, modelId);
  const isAutoSlotMode =
    !isActiveSlotMode && activeModeSlots.length > 0 && !AVATAR_MODELS.has(modelId);
  const mediaGroupId = ctx.message?.media_group_id;
  if (mediaGroupId && !isActiveSlotMode && !isAutoSlotMode) {
    const key = `${ctx.user.id}__${mediaGroupId}`;
    const hasCaption = !!ctx.message?.caption?.trim();
    const existing = videoMediaGroupBuffer.get(key);
    if (existing?.processed) return;
    if (existing) clearTimeout(existing.timer);
    if (hasCaption) {
      videoMediaGroupBuffer.set(key, {
        processed: true,
        timer: setTimeout(() => videoMediaGroupBuffer.delete(key), 10_000),
      });
    } else {
      videoMediaGroupBuffer.set(key, {
        processed: false,
        timer: setTimeout(() => videoMediaGroupBuffer.delete(key), 10_000),
      });
      return;
    }
  }

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

  // Lazily resolve the live download URL only for paths that need bytes now
  // (caption+photo, HeyGen avatar legacy, no-caption-no-slot legacy below).
  let cachedTgUrl: string | null = null;
  const getLiveTgUrl = async (): Promise<string> => {
    if (cachedTgUrl) return cachedTgUrl;
    const file = await ctx.api.getFile(fileId);
    cachedTgUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
    return cachedTgUrl;
  };

  // ── Slot-based upload (new path) ──────────────────────────────────────────
  const activeSlot = getActiveSlot(ctx.user.id);
  if (activeSlot && activeSlot.section === "video") {
    const slotModelId = activeSlot.modelId;
    const slotsForModel =
      slotModelId === modelId
        ? activeModeSlots
        : await getActiveModelSlots(ctx.user.id, slotModelId);
    const slot = slotsForModel.find((s) => s.slotKey === activeSlot.slotKey);

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
        await sendVideoMediaInputStatus(ctx);
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
        await executeVideoPrompt(ctx, caption);
      }
    });
    return;
  }

  // ── Auto-slot distribution: distribute sibling photos across slots in
  // definition order; siblings that don't fit anywhere become overflow. After
  // the album debounce settles we send a single status reply (with overflow
  // notice prepended when applicable). If the album carried a caption and all
  // required slots end up filled, we trigger generation with the caption as
  // the prompt — same as if the user had typed it after the upload finished.
  if (isAutoSlotMode && model) {
    const userId = ctx.user.id;
    const current = await userStateService.getMediaInputs(userId, modelId);
    const targetSlot = pickAutoSlot(activeModeSlots, current, "image");
    if (targetSlot) {
      await userStateService.addMediaInput(userId, modelId, targetSlot.slotKey, tgSlotValue);
      debounceSlotReply(
        userId,
        mediaGroupId,
        async () => {
          const fresh = await userStateService.getMediaInputs(userId, modelId);
          const count = fresh[targetSlot.slotKey]?.length ?? 0;
          if (count === 0) return;
          await ctx.reply(buildSlotUploadedMessage(targetSlot, count, ctx.t));
        },
        targetSlot.slotKey,
      );
    }
    trackDistribution(userId, mediaGroupId, {
      overflow: !targetSlot,
      caption: caption || undefined,
      modelId,
      section: "video",
    });
    debounceSlotReply(userId, mediaGroupId, async () => {
      const tracked = consumeDistribution(userId, mediaGroupId);
      const overflowText =
        tracked && tracked.overflowCount > 0 ? buildOverflowMessage(model, ctx.t) : "";
      await sendVideoMediaInputStatus(ctx, { prependText: overflowText });
      if (tracked?.caption) {
        const finalInputs = await userStateService.getMediaInputs(userId, modelId);
        const missingRequired = findMissingRequiredSlot(modelId, activeModeSlots, finalInputs);
        if (!missingRequired) {
          await executeVideoPrompt(ctx, tracked.caption);
        }
      }
    });
    return;
  }

  // Below paths (caption+photo legacy, HeyGen, no-caption legacy) need the live URL.
  const tgUrl = await getLiveTgUrl();

  // ── Photo with caption → generate immediately ─────────────────────────────
  if (caption) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const supportsImages = model?.supportsImages ?? false;

    // If model has media input slots, save the photo to the first slot
    let mediaInputs: Record<string, string[]> | undefined;
    const photoCaptionSlots = await getActiveModelSlots(ctx.user.id, modelId);
    if (supportsImages && photoCaptionSlots.length) {
      const firstSlot = photoCaptionSlots[0];
      mediaInputs = { [firstSlot.slotKey]: [tgUrl] };
    }

    const videoSettings = await userStateService.getVideoSettings(ctx.user.id);
    const modelSettings = videoSettings[modelId];

    const allModelSettings = await userStateService.getModelSettings(ctx.user.id);
    const fullModelSettings = allModelSettings[modelId] ?? {};
    const validationError = videoGenerationService.validateVideoRequest(
      {
        modelId,
        prompt: caption,
        imageUrl: supportsImages ? tgUrl : undefined,
        aspectRatio: modelSettings?.aspectRatio,
        duration: modelSettings?.duration,
        modelSettings: fullModelSettings,
        userId: ctx.user.id,
      },
      { hasVoiceFile: false },
    );
    if (validationError) {
      await ctx.reply(ctx.t.video[validationError.key as keyof typeof ctx.t.video] as string);
      return;
    }

    if (!supportsImages) {
      await ctx.reply(ctx.t.video.imageIgnoredUnsupported).catch(() => void 0);
    }

    const pendingMsg = await ctx.reply(pickVideoPending(ctx));

    try {
      await videoGenerationService.submitVideo({
        userId: ctx.user.id,
        modelId,
        prompt: caption,
        imageUrl: supportsImages ? tgUrl : undefined,
        mediaInputs,
        telegramChatId: chatId,
        sendOriginalLabel: ctx.t.common.sendOriginal,
        aspectRatio: modelSettings?.aspectRatio,
        duration: modelSettings?.duration,
      });

      await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
      await ctx.reply(pickVideoPending(ctx));
    } catch (err: unknown) {
      await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
      if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
        await replyInsufficientTokens(ctx);
      } else {
        logger.error(err, "Video photo+caption error");
        await ctx.reply(ctx.t.video.generationFailed);
      }
    }
    return;
  }

  // No caption, no slots — legacy path: save as one-shot reference for next text message
  await userStateService.setVideoRefImageUrl(ctx.user.id, tgUrl);
  await ctx.reply(ctx.t.video.videoPhotoSaved);
}

// ── Video handler in VIDEO_ACTIVE state (D-ID driver_url) ─────────────────────

export async function handleVideoVideo(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const isVideoMsg = !!ctx.message?.video;
  const isVideoDoc = !!ctx.message?.document?.mime_type?.startsWith("video/");
  if (!isVideoMsg && !isVideoDoc) return;
  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId;
  if (!modelId) return;
  const model = AI_MODELS[modelId];

  const videoMsg = isVideoMsg ? ctx.message!.video! : null;
  const videoDoc = isVideoDoc ? ctx.message!.document! : null;
  const fileId = (videoMsg?.file_id ?? videoDoc!.file_id) as string;
  const fileSize = videoMsg?.file_size ?? videoDoc?.file_size ?? 0;
  const tgKind: "video" | "doc" = videoMsg ? "video" : "doc";
  if (fileSize > TG_DOWNLOAD_LIMIT_BYTES) {
    await ctx.reply(ctx.t.errors.fileTooLargeForBotApi);
    return;
  }
  const tgSlotValue = buildTgSlotValue(tgKind, fileId);
  const activeModeSlots = await getActiveModelSlots(ctx.user.id, modelId);

  // Active reference_element slot: videos are exclusive (replace any images).
  const activeSlot = getActiveSlot(ctx.user.id);
  if (activeSlot && activeSlot.section === "video") {
    const slotModelId = activeSlot.modelId;
    const slotsForModel =
      slotModelId === modelId
        ? activeModeSlots
        : await getActiveModelSlots(ctx.user.id, slotModelId);
    const slot = slotsForModel.find((s) => s.slotKey === activeSlot.slotKey);
    if (slot?.constraints) {
      let durationSec: number | undefined = videoMsg?.duration;
      let widthPx: number | undefined = videoMsg?.width;
      let heightPx: number | undefined = videoMsg?.height;
      let fileSizeBytes: number | undefined = fileSize || undefined;
      if (isVideoDoc) {
        try {
          const file = await ctx.api.getFile(fileId);
          const probeUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
          const meta = await probeVideoMetadata(probeUrl);
          if (meta.durationSec !== null) durationSec = meta.durationSec;
          if (meta.width !== null) widthPx = meta.width;
          if (meta.height !== null) heightPx = meta.height;
          fileSizeBytes = meta.fileSizeBytes;
        } catch (err) {
          logger.warn({ err }, "probeVideoMetadata failed for document");
          await ctx.reply(ctx.t.errors.mediaSlotReadMetadataFailed);
          return;
        }
      }
      const violation = validateMediaAgainstSlot(
        slot,
        { durationSec, widthPx, heightPx, fileSizeBytes },
        ctx.t,
      );
      if (violation) {
        await ctx.reply(violation);
        return;
      }
    }
    const userId = ctx.user.id;
    const mediaGroupId = ctx.message?.media_group_id;
    if (slot?.mode === "reference_element") {
      await userStateService.clearMediaInputSlot(userId, slotModelId, activeSlot.slotKey);
      await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
      debounceSlotReply(userId, mediaGroupId, async () => {
        clearActiveSlot(userId);
        await sendVideoMediaInputStatus(ctx);
      });
      return;
    }
    if (slot?.mode === "first_clip" || slot?.mode === "motion_video") {
      await userStateService.clearMediaInputSlot(userId, slotModelId, activeSlot.slotKey);
      await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
      debounceSlotReply(userId, mediaGroupId, async () => {
        clearActiveSlot(userId);
        await sendVideoMediaInputStatus(ctx);
      });
      return;
    }
    if (slot?.mode === "reference_video") {
      const current = await userStateService.getMediaInputs(userId, slotModelId);
      const existing = current[activeSlot.slotKey] ?? [];
      if (existing.length >= activeSlot.maxImages) {
        await userStateService.clearMediaInputSlot(userId, slotModelId, activeSlot.slotKey);
      }
      await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
      debounceSlotReply(userId, mediaGroupId, async () => {
        const freshInputs = await userStateService.getMediaInputs(userId, slotModelId);
        const freshCount = freshInputs[activeSlot.slotKey]?.length ?? 0;
        if (freshCount >= activeSlot.maxImages) {
          clearActiveSlot(userId);
          await sendVideoMediaInputStatus(ctx);
        } else {
          const kb = new InlineKeyboard().text(
            ctx.t.mediaInput.doneUploading,
            `mi_done:${activeSlot.slotKey}`,
          );
          const label =
            ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
          const m = ctx.t.mediaInput.imageSaved
            .replace("{slot}", String(label))
            .replace("{n}", String(freshCount))
            .replace("{max}", String(activeSlot.maxImages));
          await ctx.reply(m, { reply_markup: kb });
        }
      });
      return;
    }
  }

  // ── Auto-slot distribution for videos ─────────────────────────────────────
  // Same mechanic as handleVideoPhoto, but only video-accepting slots are
  // candidates. Lets the user mix photos + videos in one album: each is
  // routed to the first slot that accepts its type.
  if (!activeSlot && activeModeSlots.length > 0 && !AVATAR_MODELS.has(modelId)) {
    const userId = ctx.user.id;
    const mediaGroupId = ctx.message?.media_group_id;
    const caption = ctx.message?.caption?.trim();
    const current = await userStateService.getMediaInputs(userId, modelId);
    const targetSlot = pickAutoSlot(activeModeSlots, current, "video");
    if (targetSlot) {
      await userStateService.addMediaInput(userId, modelId, targetSlot.slotKey, tgSlotValue);
      debounceSlotReply(
        userId,
        mediaGroupId,
        async () => {
          const fresh = await userStateService.getMediaInputs(userId, modelId);
          const count = fresh[targetSlot.slotKey]?.length ?? 0;
          if (count === 0) return;
          await ctx.reply(buildSlotUploadedMessage(targetSlot, count, ctx.t));
        },
        targetSlot.slotKey,
      );
    }
    trackDistribution(userId, mediaGroupId, {
      overflow: !targetSlot,
      caption: caption || undefined,
      modelId,
      section: "video",
    });
    debounceSlotReply(userId, mediaGroupId, async () => {
      const tracked = consumeDistribution(userId, mediaGroupId);
      const overflowText =
        tracked && tracked.overflowCount > 0 ? buildOverflowMessage(model, ctx.t) : "";
      await sendVideoMediaInputStatus(ctx, { prependText: overflowText });
      if (tracked?.caption) {
        const finalInputs = await userStateService.getMediaInputs(userId, modelId);
        const missingRequired = findMissingRequiredSlot(modelId, activeModeSlots, finalInputs);
        if (!missingRequired) {
          await executeVideoPrompt(ctx, tracked.caption);
        }
      }
    });
    return;
  }

  if (!model?.supportsVideo) return;
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  await userStateService.setVideoRefDriverUrl(ctx.user.id, fileUrl);
  await ctx.reply(ctx.t.video.videoDriverSaved);
}

// ── HEYGEN_AVATAR_PHOTO state: capture photo, persist to S3, enqueue worker ──

export async function handleAvatarPhotoCapture(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;

  // Accept either a compressed photo or an image-document upload.
  let fileId: string | undefined;
  let mimeHint: string | undefined;
  if (ctx.message?.photo) {
    fileId = ctx.message.photo.at(-1)?.file_id;
  } else if (ctx.message?.document?.mime_type?.startsWith("image/")) {
    fileId = ctx.message.document.file_id;
    mimeHint = ctx.message.document.mime_type;
  }
  if (!fileId) return;

  const file = await ctx.api.getFile(fileId);
  const tgUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;

  const userId = ctx.user.id;
  const chatId = ctx.chat?.id ?? Number(userId);

  // Fetch original image to (a) detect content-type and (b) build a thumbnail.
  const imgRes = await fetch(tgUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch avatar photo from Telegram: ${imgRes.status}`);
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType =
    mimeHint ??
    (imgRes.headers.get("content-type")?.startsWith("image/")
      ? imgRes.headers.get("content-type")!
      : "image/jpeg");

  // Persist original to S3 so the worker can fetch it via presigned URL.
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const s3Key = `avatar_photo/${userId.toString()}/${file.file_id}.${ext}`;
  const uploadedKey = await s3Service.uploadBuffer(s3Key, imageBuffer, contentType);
  if (!uploadedKey) throw new Error("Failed to upload avatar source to S3");

  // Thumbnail (best-effort, used as preview).
  let previewUrl: string | undefined;
  const thumbBuffer = await s3Service.generateThumbnail(imageBuffer, contentType).catch(() => null);
  if (thumbBuffer) {
    const thumbKey = `avatar_photo/${userId.toString()}/${file.file_id}_thumb.webp`;
    const uploadedThumbKey = await s3Service
      .uploadBuffer(thumbKey, thumbBuffer, "image/webp")
      .catch(() => null);
    if (uploadedThumbKey) previewUrl = uploadedThumbKey;
  }

  // Create UserAvatar in `creating` state — worker will fill in externalId + providerKeyId.
  const avatar = await userAvatarService.create(userId, {
    provider: "heygen",
    name: ctx.t.video.myAvatarDefaultName,
    externalId: undefined,
    status: "creating",
    previewUrl,
  });

  await getAvatarQueue().add("create", {
    userAvatarId: avatar.id,
    userId: userId.toString(),
    provider: "heygen",
    action: "create",
    s3Key: uploadedKey,
    telegramChatId: chatId,
  });

  // Show the section reply keyboard immediately; ready message arrives async from worker.
  const webappUrl = config.bot.webappUrl;
  const token = webappUrl ? generateWebToken(userId, config.bot.token) : "";
  const managementBtn = webappUrl
    ? {
        text: ctx.t.video.management,
        web_app: { url: `${webappUrl}?page=management&section=video&wtoken=${token}` },
      }
    : { text: ctx.t.video.management };

  await ctx.reply(ctx.t.video.avatarCreationStarted, {
    reply_markup: {
      keyboard: [
        [{ text: ctx.t.video.newDialog }],
        [{ text: ctx.t.video.avatars }, { text: ctx.t.video.lipSync }],
        [managementBtn],
        [{ text: ctx.t.common.backToMain }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });

  // Auto-activate HeyGen so the user can immediately submit a prompt.
  const currentState = await userStateService.get(userId);
  if (currentState?.videoModelId === "heygen" || currentState?.state !== "VIDEO_ACTIVE") {
    await activateVideoModel(ctx, "heygen");
  }
}

export async function handleHeygenAvatarCancel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "VIDEO_ACTIVE", "video");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(ctx.t.video.avatarCreationCancelled).catch(() => void 0);
}

// ── Voice/audio handler in VIDEO_ACTIVE state ────────────────────────────────
// Non-avatar models: transcribe speech → offer as text prompt.
// Avatar models (HeyGen, D-ID): offer choice — use as lip-sync audio OR transcribe.

export async function handleVideoVoice(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const audioMsg = ctx.message?.voice ?? ctx.message?.audio;
  if (!audioMsg) return;

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const userId = ctx.user.id;
  const state = await userStateService.get(userId);
  const modelId = state?.videoModelId ?? "kling";

  // Active reference_audio slot: capture audio URL into slot.
  const activeSlot = getActiveSlot(userId);
  if (activeSlot && activeSlot.section === "video") {
    const slotModelId = activeSlot.modelId;
    const slotsForVoice = await getActiveModelSlots(userId, slotModelId);
    const slot = slotsForVoice.find((s) => s.slotKey === activeSlot.slotKey);
    if (slot?.mode === "driving_audio" || slot?.mode === "reference_audio") {
      const audioSize = audioMsg.file_size ?? 0;
      if (audioSize > TG_DOWNLOAD_LIMIT_BYTES) {
        await ctx.reply(ctx.t.errors.fileTooLargeForBotApi);
        return;
      }
      const tgKind = ctx.message?.voice ? "voice" : "audio";
      const tgSlotValue = buildTgSlotValue(tgKind, audioMsg.file_id);
      if (slot.mode === "driving_audio") {
        await userStateService.clearMediaInputSlot(userId, slotModelId, activeSlot.slotKey);
        await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
        clearActiveSlot(userId);
        await sendVideoMediaInputStatus(ctx);
        return;
      }
      const current = await userStateService.getMediaInputs(userId, slotModelId);
      const existing = current[activeSlot.slotKey] ?? [];
      if (existing.length >= activeSlot.maxImages) {
        await userStateService.clearMediaInputSlot(userId, slotModelId, activeSlot.slotKey);
      }
      await userStateService.addMediaInput(userId, slotModelId, activeSlot.slotKey, tgSlotValue);
      const updatedCount = Math.min(existing.length + 1, activeSlot.maxImages);
      if (updatedCount >= activeSlot.maxImages) {
        clearActiveSlot(userId);
        await sendVideoMediaInputStatus(ctx);
      } else {
        const kb = new InlineKeyboard().text(
          ctx.t.mediaInput.doneUploading,
          `mi_done:${activeSlot.slotKey}`,
        );
        const label =
          ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
        const m = ctx.t.mediaInput.imageSaved
          .replace("{slot}", String(label))
          .replace("{n}", String(updatedCount))
          .replace("{max}", String(activeSlot.maxImages));
        await ctx.reply(m, { reply_markup: kb });
      }
      return;
    }
  }

  if (!AVATAR_MODELS.has(modelId)) {
    // Non-avatar model: transcribe voice → offer as prompt
    await transcribeAndReply(ctx, "video");
    return;
  }

  // Avatar model: upload to S3, then show choice buttons
  const file = await ctx.api.getFile(audioMsg.file_id);
  const tgUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;

  const isVoice = !!ctx.message?.voice;
  const contentType = isVoice ? "audio/ogg" : (ctx.message?.audio?.mime_type ?? "audio/mpeg");
  const ext = isVoice ? "ogg" : (file.file_path?.split(".").pop() ?? "mp3");

  const s3Key = `voice/${userId.toString()}/${file.file_id}.${ext}`;
  const uploadedKey = await s3Service.uploadFromUrl(s3Key, tgUrl, contentType).catch(() => null);

  // Generate an ID and store voice data for both callback paths
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  storeAvatarVoice(userId, id, { uploadedKey, tgUrl });

  const kb = new InlineKeyboard()
    .text(ctx.t.voice.avatarChoiceUseAudio, `va:${id}`)
    .row()
    .text(ctx.t.voice.avatarChoiceTranscribe, `vt:${id}`);

  await ctx.reply(ctx.t.video.videoVoiceSaved, { reply_markup: kb });
}

/**
 * Callback: user chose to use voice as raw audio for avatar lip-sync.
 * Continues the previous avatar voice flow.
 */
export async function handleVideoAvatarVoiceCallback(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const id = ctx.callbackQuery?.data?.slice(3); // "va:{id}" → id
  if (!id) return;

  const entry = getAvatarVoice(ctx.user.id, id);
  if (!entry) {
    await ctx.reply(ctx.t.voice.expired);
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Remove choice message
  await ctx.deleteMessage().catch(() => void 0);

  const userId = ctx.user.id;
  const state = await userStateService.get(userId);
  const modelId = state?.videoModelId ?? "kling";

  const allModelSettings = await userStateService.getModelSettings(userId);
  const fullModelSettings = allModelSettings[modelId] ?? {};
  const videoSettings = await userStateService.getVideoSettings(userId);
  const modelSettings = videoSettings[modelId];
  const imageUrl = (await userStateService.getAndClearVideoRefImageUrl(userId)) ?? undefined;

  const validationError = videoGenerationService.validateVideoRequest(
    {
      modelId,
      prompt: "",
      imageUrl,
      aspectRatio: modelSettings?.aspectRatio,
      duration: modelSettings?.duration,
      modelSettings: {
        ...fullModelSettings,
        ...(entry.uploadedKey ? { voice_s3key: entry.uploadedKey } : { voice_url: entry.tgUrl }),
      },
      userId,
    },
    { hasVoiceFile: true },
  );
  if (validationError) {
    await ctx.reply(ctx.t.video[validationError.key as keyof typeof ctx.t.video] as string);
    return;
  }

  const pendingMsg = await ctx.reply(ctx.t.video.videoVoiceQueuing);

  try {
    await videoGenerationService.submitVideo({
      userId,
      modelId,
      prompt: "",
      imageUrl,
      telegramChatId: chatId,
      sendOriginalLabel: ctx.t.common.sendOriginal,
      aspectRatio: modelSettings?.aspectRatio,
      duration: modelSettings?.duration,
      extraModelSettings: entry.uploadedKey
        ? { voice_s3key: entry.uploadedKey, voice_url: "" }
        : { voice_url: entry.tgUrl, voice_s3key: "" },
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(pickVideoPending(ctx));
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "NO_SUBSCRIPTION") {
      await replyNoSubscription(ctx);
    } else if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await replyInsufficientTokens(ctx);
    } else {
      logger.error(err, "Video avatar voice error");
      await ctx.reply(ctx.t.video.generationFailed);
    }
  }
}

// ── HIGGSFIELD_SOUL_PHOTO state: collect photos for Soul character creation ──

/** Cost of Soul character creation in USD */
const SOUL_COST_USD = 2.5;

/**
 * Receives a photo (compressed or document) while in HIGGSFIELD_SOUL_PHOTO state.
 * Stores the Telegram file_id (no TTL) in the persistent Soul buffer so the user
 * can pause mid-upload without losing progress. S3 upload is deferred until submit.
 * Uses debounceSoulReply to send only one reply per media group (album).
 */
export async function handleSoulPhotoCapture(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;

  let fileId: string | undefined;
  let tgKind: "photo" | "doc" | undefined;
  if (ctx.message?.photo) {
    fileId = ctx.message.photo.at(-1)?.file_id;
    tgKind = "photo";
  } else if (ctx.message?.document?.mime_type?.startsWith("image/")) {
    fileId = ctx.message.document.file_id;
    tgKind = "doc";
  }
  if (!fileId || !tgKind) return;

  const userId = ctx.user.id;

  const fileEntry = buildTgSlotValue(tgKind, fileId);
  const count = await addSoulPhoto(userId, fileEntry);

  // Debounce reply for media groups (albums) — only send one message per group
  debounceSoulReply(userId, ctx.message?.media_group_id, async () => {
    // Re-read count after debounce (more photos may have arrived)
    const currentBuf = await getSoulBuffer(userId);
    const n = currentBuf?.fileIds.length ?? count;

    const text = ctx.t.video.soulPhotoCount
      .replace("{n}", String(n))
      .replace("{max}", String(SOUL_MAX_PHOTOS));

    const kb = new InlineKeyboard();
    if (n >= SOUL_MIN_PHOTOS) {
      kb.text(ctx.t.video.soulCreateButton.replace("{n}", String(n)), "soul_create_submit").row();
    }
    kb.text(ctx.t.video.soulCancelButton, "soul_create_cancel");

    await ctx.reply(text, { reply_markup: kb });
  });
}

/**
 * Callback: user taps "Create character" after uploading photos.
 * Validates min photos, checks balance, deducts $2.50, resolves Telegram file_ids
 * into S3 keys, creates UserAvatar + queue job.
 */
export async function handleSoulCreateSubmit(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();

  const userId = ctx.user.id;
  try {
    if (!(await acquireLock(`dedup:soul:${userId}`, 120))) return;
  } catch {
    // Redis unavailable — proceed without dedup rather than blocking the user
  }

  try {
    const buf = await clearSoulBuffer(userId);

    if (!buf || buf.fileIds.length < SOUL_MIN_PHOTOS) {
      const n = buf?.fileIds.length ?? 0;
      await ctx
        .editMessageText(
          ctx.t.video.soulMinPhotos
            .replace("{min}", String(SOUL_MIN_PHOTOS))
            .replace("{n}", String(n)),
        )
        .catch(() => void 0);
      await userStateService.setState(userId, "DESIGN_ACTIVE", "design");
      return;
    }

    // Check balance ($2.50)
    const costTokens = usdToTokens(SOUL_COST_USD);
    try {
      await checkBalance(userId, costTokens);
    } catch {
      await ctx.editMessageText(ctx.t.errors.insufficientTokens).catch(() => void 0);
      await userStateService.setState(userId, "DESIGN_ACTIVE", "design");
      return;
    }

    // Show progress message while we download + upload photos
    await ctx.editMessageText(ctx.t.video.soulCreating).catch(() => void 0);

    // Resolve Telegram file_ids → S3 keys. Deferred from capture time so the user
    // can take their time uploading without TTL pressure.
    const s3Keys: string[] = [];
    for (const entry of buf.fileIds) {
      const rest = entry.startsWith("tg:") ? entry.slice(3) : entry;
      const idx = rest.indexOf(":");
      const fileId = idx === -1 ? rest : rest.slice(idx + 1);
      if (!fileId) continue;
      try {
        const file = await ctx.api.getFile(fileId);
        const tgUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
        const s3Key = `soul_photos/${userId.toString()}/${Date.now()}_${file.file_id}.jpg`;
        const uploaded = await s3Service.uploadFromUrl(s3Key, tgUrl, "image/jpeg");
        if (uploaded) s3Keys.push(uploaded);
      } catch (err) {
        logger.warn({ userId, fileId, err }, "Soul photo S3 upload failed, skipping");
      }
    }

    if (s3Keys.length < SOUL_MIN_PHOTOS) {
      await ctx.reply(
        ctx.t.video.soulMinPhotos
          .replace("{min}", String(SOUL_MIN_PHOTOS))
          .replace("{n}", String(s3Keys.length)),
      );
      await userStateService.setState(userId, "DESIGN_ACTIVE", "design");
      return;
    }

    // Deduct tokens only after we have enough usable photos
    await deductTokens(userId, costTokens, "higgsfield_soul", undefined, "soul_creation");

    // Create UserAvatar record
    const avatar = await userAvatarService.create(userId, {
      provider: "higgsfield_soul",
      name: ctx.t.video.myAvatarDefaultName,
      externalId: undefined,
      status: "creating",
      previewUrl: undefined,
    });

    // Enqueue avatar creation job
    await getAvatarQueue().add("create", {
      userAvatarId: avatar.id,
      userId: userId.toString(),
      provider: "higgsfield_soul",
      action: "create",
      telegramChatId: ctx.chat?.id ?? Number(userId),
      s3Keys,
      characterName: ctx.t.video.myAvatarDefaultName,
    });

    // Restore FSM to DESIGN_ACTIVE
    await userStateService.setState(userId, "DESIGN_ACTIVE", "design");
  } finally {
    await releaseLock(`dedup:soul:${userId}`);
  }
}

/**
 * Callback: user cancels Soul character creation.
 * Clears buffer, restores FSM to DESIGN_ACTIVE.
 */
export async function handleSoulCreateCancel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.answerCallbackQuery();

  await clearSoulBuffer(ctx.user.id);
  await userStateService.setState(ctx.user.id, "DESIGN_ACTIVE", "design");
  await ctx.editMessageText(ctx.t.video.soulCancelled).catch(() => void 0);
}

/**
 * Callback: user chose to transcribe voice instead of using as avatar audio.
 */
export async function handleVideoTranscribeCallback(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const id = ctx.callbackQuery?.data?.slice(3); // "vt:{id}" → id
  if (!id) return;

  // Remove choice buttons
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => void 0);

  // We need to get the original audio to transcribe it. The avatar voice store
  // has the S3 key / TG URL. Download and transcribe.
  const entry = getAvatarVoice(ctx.user.id, id);
  if (!entry) {
    await ctx.reply(ctx.t.voice.expired);
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const pendingMsg = await ctx.reply(ctx.t.voice.transcribing);

  try {
    const url = entry.uploadedKey
      ? await (async () => {
          const { getFileUrl } = await import("@metabox/api/services/s3");
          return (await getFileUrl(entry.uploadedKey!)) ?? entry.tgUrl;
        })()
      : entry.tgUrl;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const { transcribeAudio } = await import("@metabox/api/services/transcription");
    const lang = ctx.user!.language === "ru" ? "ru" : undefined;
    const text = await transcribeAudio(buffer, "audio/ogg", lang);

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

    if (!text.trim()) {
      await ctx.reply(ctx.t.voice.failed);
      return;
    }

    // Store and show transcription with "Use as prompt" button
    const { randomBytes } = await import("crypto");
    const vpId = randomBytes(6).toString("hex");
    storeVoiceText(ctx.user!.id, vpId, text);

    const { escapeMarkdownV2 } = await import("../utils/voice-transcribe.js");
    const header = escapeMarkdownV2(ctx.t.voice.transcriptionResult);
    const hint = escapeMarkdownV2(ctx.t.voice.transcriptionHint);
    const md2Text = `${header}\n\n\`\`\`\n${text}\n\`\`\`\n\n${hint}`;

    const kb = new InlineKeyboard().text(ctx.t.voice.useAsPrompt, `vp:video:${vpId}`);
    await ctx.reply(md2Text, { parse_mode: "MarkdownV2", reply_markup: kb });
  } catch (err) {
    logger.error(err, "handleVideoTranscribeCallback: failed");
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(ctx.t.voice.failed);
  }
}
