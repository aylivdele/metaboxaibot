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
} from "@metabox/api/services";
import { buildCostLine } from "../utils/cost-line.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";
import { HeyGenAvatarAdapter } from "@metabox/api/ai/avatar/heygen";
import { ElevenLabsAdapter } from "@metabox/api/ai/audio";
import {
  MODELS_BY_SECTION,
  FAMILIES_BY_SECTION,
  MODEL_TO_FAMILY,
  AI_MODELS,
  config,
  resolveModelDisplay,
  generateWebToken,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";
import {
  transcribeAndReply,
  storeTranscription as storeVoiceText,
} from "../utils/voice-transcribe.js";

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

async function activateVideoModel(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;
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
    const costLine = buildCostLine(model, modelSettings, ctx.t, defaultDuration);
    const webappUrl = config.bot.webappUrl;
    const kb = webappUrl
      ? new InlineKeyboard().webApp(
          ctx.t.video.management,
          `${webappUrl}?page=management&section=video`,
        )
      : undefined;
    const { name: modelName, description: modelDesc } = resolveModelDisplay(
      modelId,
      ctx.user.language,
      model,
    );
    await ctx.reply(`${modelName}\n\n${modelDesc}\n\n${costLine}`, {
      reply_markup: kb,
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
    await ctx.reply(appendVoiceHint ? `${hint}\n\n${ctx.t.voice.inputHint}` : hint);
  } else {
    await ctx.reply(ctx.t.video.modelActivated);
  }
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

  // For D-ID: pick up any previously saved reference photo (one-shot)
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

  // Only the captioned photo from an album triggers generation; siblings are ignored.
  const mediaGroupId = ctx.message?.media_group_id;
  if (mediaGroupId) {
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

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.videoModelId ?? "kling";
  const fileId = isPhoto ? ctx.message!.photo!.at(-1)!.file_id : ctx.message!.document!.file_id;
  const file = await ctx.api.getFile(fileId);
  const tgUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;

  // if (modelId === "heygen") {
  //   const userId = ctx.user.id;
  //   const s3Key = `avatar_photo/${userId.toString()}/${file.file_id}.jpg`;
  //   const uploadedKey = await s3Service.uploadFromUrl(s3Key, tgUrl, "image/jpeg").catch(() => null);
  //   const publicUrl = uploadedKey
  //     ? ((await s3Service.getFileUrl(uploadedKey).catch(() => null)) ?? tgUrl)
  //     : tgUrl;

  //   await userUploadsService.create(userId, {
  //     type: "avatar_photo",
  //     name: ctx.t.video.myAvatarDefaultName,
  //     url: publicUrl,
  //     s3Key: uploadedKey ?? undefined,
  //   });

  //   // Auto-select: store in modelSettings so adapter picks it up on next generation
  //   await userStateService.setModelSettings(userId, "heygen", {
  //     avatar_photo_url: publicUrl,
  //     avatar_photo_s3key: uploadedKey ?? "",
  //     avatar_id: "",
  //   });

  //   await ctx.reply(ctx.t.video.avatarPhotoSaved);
  //   return;
  // }

  // If caption is provided, treat it as a prompt and generate immediately.
  // When the model doesn't support images, we still start generation with
  // the caption as prompt and warn the user that the image is ignored.
  const caption = ctx.message.caption?.trim();
  const model = AI_MODELS[modelId];
  if (caption) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const supportsImages = model?.supportsImages ?? false;

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

  // No caption — save as one-shot reference for next text message
  await userStateService.setVideoRefImageUrl(ctx.user.id, tgUrl);
  await ctx.reply(ctx.t.video.videoPhotoSaved);
}

// ── Video handler in VIDEO_ACTIVE state (D-ID driver_url) ─────────────────────

export async function handleVideoVideo(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.video) return;
  const modelId = await userStateService.get(ctx.user.id).then((s) => s?.videoModelId);
  if (!modelId || !AI_MODELS[modelId]?.supportsVideo) return;
  const file = await ctx.api.getFile(ctx.message.video.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  await userStateService.setVideoRefDriverUrl(ctx.user.id, fileUrl);
  await ctx.reply(ctx.t.video.videoDriverSaved);
}

// ── HEYGEN_AVATAR_PHOTO state: capture photo and synchronously upload as HeyGen asset ──

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

  // Fetch image buffer
  const imgRes = await fetch(tgUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch avatar photo from Telegram: ${imgRes.status}`);
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
  // Telegram photo downloads often return application/octet-stream;
  // for compressed photos mimeHint is undefined — default to image/jpeg.
  const contentType =
    mimeHint ??
    (imgRes.headers.get("content-type")?.startsWith("image/")
      ? imgRes.headers.get("content-type")!
      : "image/jpeg");

  // Upload directly to HeyGen asset storage — synchronous, no worker needed
  const adapter = new HeyGenAvatarAdapter();
  const { externalId } = await adapter.create(imageBuffer, contentType);

  // Generate thumbnail and upload to S3 — store S3 key, not presigned URL
  let previewUrl: string | undefined;
  const thumbBuffer = await s3Service.generateThumbnail(imageBuffer, contentType).catch(() => null);
  if (thumbBuffer) {
    const thumbKey = `avatar_photo/${userId.toString()}/${file.file_id}_thumb.webp`;
    const uploadedThumbKey = await s3Service
      .uploadBuffer(thumbKey, thumbBuffer, "image/webp")
      .catch(() => null);
    if (uploadedThumbKey) {
      previewUrl = uploadedThumbKey; // resolved to fresh URL at serve time
    }
  }

  // Persist UserAvatar record (status ready immediately)
  await userAvatarService.create(userId, {
    provider: "heygen",
    name: ctx.t.video.myAvatarDefaultName,
    externalId,
    status: "ready",
    previewUrl,
  });

  // Send the section reply keyboard so the user can immediately interact.
  const webappUrl = config.bot.webappUrl;
  const token = webappUrl ? generateWebToken(userId, config.bot.token) : "";
  const managementBtn = webappUrl
    ? {
        text: ctx.t.video.management,
        web_app: { url: `${webappUrl}?page=management&section=video&wtoken=${token}` },
      }
    : { text: ctx.t.video.management };

  await ctx.reply(ctx.t.video.avatarReady, {
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
  // If HeyGen is already the active model, just switch state to VIDEO_ACTIVE
  // without re-sending the model intro + hint.
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

  // Remove choice buttons
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => void 0);

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
