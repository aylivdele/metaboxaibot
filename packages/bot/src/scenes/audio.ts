import { InlineKeyboard } from "grammy";
import type { BotContext } from "../types/context.js";
import { audioGenerationService, userStateService } from "@metabox/api/services";
import { acquireKey, recordSuccess, recordError } from "@metabox/api/services/key-pool";
import { ElevenLabsAdapter } from "@metabox/api/ai/audio";
import { db } from "@metabox/api/db";
import {
  AI_MODELS,
  config,
  generateWebToken,
  resolveModelDisplay,
  UserFacingError,
  resolveUserFacingError,
} from "@metabox/shared";
import { logger } from "../logger.js";
import { buildCostLine } from "../utils/cost-line.js";
import { replyNoSubscription, replyInsufficientTokens } from "../utils/reply-error.js";
import { transcribeAndReply } from "../utils/voice-transcribe.js";
import { uploadBuffer, buildS3Key } from "@metabox/api/services/s3";
import { acquireLock, releaseLock } from "../utils/dedup.js";

// ── Sub-section entry points ──────────────────────────────────────────────────

/**
 * Called when user presses one of the audio sub-section reply buttons.
 * Sets AUDIO_ACTIVE state with the correct modelId and sends instructions.
 */
export async function handleAudioSubSection(ctx: BotContext, modelId: string): Promise<void> {
  if (!ctx.user) return;

  await userStateService.setState(ctx.user.id, "AUDIO_ACTIVE", "audio");
  await userStateService.setModelForSection(ctx.user.id, "audio", modelId);

  const instructions: Record<string, string> = {
    "tts-openai": ctx.t.audio.ttsActivated,
    "tts-el": ctx.t.audio.ttsElActivated,
    "voice-clone": ctx.t.audio.voiceCloneActivated,
    suno: ctx.t.audio.musicActivated,
    "music-el": ctx.t.audio.musicElActivated,
    "sounds-el": ctx.t.audio.soundsActivated,
  };

  const hint = instructions[modelId] ?? ctx.t.audio.activated;

  // For generative models (not voice-clone), show full structured message + management button
  if (modelId !== "voice-clone") {
    const model = AI_MODELS[modelId];
    if (model) {
      const allSettings = await userStateService.getModelSettings(ctx.user.id);
      const modelSettings = allSettings[modelId] ?? {};
      const costLine = buildCostLine(model, modelSettings, ctx.t);
      const webappUrl = config.bot.webappUrl;
      const token = webappUrl ? generateWebToken(ctx.user.id, config.bot.token) : "";
      const kb = webappUrl
        ? new InlineKeyboard().webApp(
            ctx.t.audio.management,
            `${webappUrl}?page=management&section=audio&wtoken=${token}`,
          )
        : undefined;
      const { name: modelName, description: modelDesc } = resolveModelDisplay(
        modelId,
        ctx.user.language,
        model,
      );
      const voiceInputHint = modelId === "tts-el" ? "" : `\n${ctx.t.voice.inputHint}`;
      await ctx.reply(`${modelName}\n\n${modelDesc}\n\n${hint}${voiceInputHint}\n\n${costLine}`, {
        reply_markup: kb,
        parse_mode: modelId === "tts-el" ? "HTML" : undefined,
      });
      return;
    }
  }

  // voice-clone: no voice transcription hint (audio is used for cloning, not prompts)
  await ctx.reply(`${ctx.t.audio.voiceClone}\n\n${hint}`);
}

// ── Voice cloning: accepts audio/voice file, creates EL voice ────────────────

export async function handleVoiceCloneUpload(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const file = ctx.message?.voice ?? ctx.message?.audio;
  if (!file) return;

  const lockKey = `dedup:voice:${ctx.user.id}:${file.file_id}`;
  try {
    if (!(await acquireLock(lockKey, 120))) return;
  } catch {
    // Redis unavailable — proceed without dedup rather than blocking the user
  }

  const pendingMsg = await ctx.reply(ctx.t.audio.voiceCloneProcessing);

  try {
    // 1. Download audio file from Telegram
    const fileInfo = await ctx.api.getFile(file.file_id);
    const filePath = fileInfo.file_path;
    if (!filePath) throw new Error("No file_path in Telegram response");

    const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${filePath}`;
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const filename = filePath.split("/").pop() ?? "voice.ogg";

    // 2. Generate sequential name
    const count = await db.userVoice.count({
      where: { userId: ctx.user.id, provider: "elevenlabs" },
    });
    const name = `Голос ${ctx.user.id} #${count + 1}`;

    // 3. Clone voice on ElevenLabs (with LRU eviction on limit error).
    // Voice_id живёт на конкретном аккаунте → сохраняем providerKeyId,
    // чтобы при TTS дёргать тот же ключ. Если ключ удалят — voice пересоздастся
    // через resolveVoiceForTTS (см. user-voice.service.ts).
    const allSettings = await userStateService.getModelSettings(ctx.user.id);
    const cloneSettings = allSettings["voice-clone"] ?? {};
    const removeBackgroundNoise = Boolean(cloneSettings.remove_background_noise ?? false);

    const acquired = await acquireKey("elevenlabs");
    let voiceId: string;
    try {
      try {
        voiceId = await ElevenLabsAdapter.cloneVoice(
          audioBuffer,
          filename,
          name,
          removeBackgroundNoise,
          acquired.apiKey,
        );
      } catch (err) {
        // ElevenLabs returns 400 with voice_limit_reached when the workspace slot limit is exceeded.
        // Эвиктим на ТОМ ЖЕ ключе — слот-лимит per-account.
        if (err instanceof Error && err.message.includes("voice_limit_reached")) {
          const freed = await evictOneElevenLabsVoice(acquired.apiKey, acquired.keyId);
          if (!freed) throw err;
          voiceId = await ElevenLabsAdapter.cloneVoice(
            audioBuffer,
            filename,
            name,
            removeBackgroundNoise,
            acquired.apiKey,
          );
        } else {
          throw err;
        }
      }
      if (acquired.keyId) void recordSuccess(acquired.keyId);
    } catch (err) {
      if (acquired.keyId) {
        void recordError(acquired.keyId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }

    // 4. Upload original audio to S3 for future voice recreation
    const ext = filename.split(".").pop() ?? "ogg";
    const audioS3Key = buildS3Key("voices", ctx.user.id.toString(), voiceId, ext);
    await uploadBuffer(audioS3Key, audioBuffer, `audio/${ext}`).catch(() => null);

    // 5. Fetch preview URL from ElevenLabs (используем тот же ключ, на котором голос создан)
    const previewUrl = await ElevenLabsAdapter.getPreviewUrl(voiceId, acquired.apiKey).catch(
      () => null,
    );

    // 6. Save to DB
    await db.userVoice.create({
      data: {
        userId: ctx.user.id,
        provider: "elevenlabs",
        name,
        externalId: voiceId,
        previewUrl,
        audioS3Key,
        status: "ready",
        providerKeyId: acquired.keyId,
      },
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    await ctx.reply(ctx.t.audio.voiceCloneSuccess.replace("{name}", name));
  } catch (err) {
    await releaseLock(lockKey);
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    logger.error(err, "Voice clone error");
    await ctx.reply(ctx.t.audio.voiceCloneFailed);
  }
}

/**
 * Frees one custom voice slot on ElevenLabs by deleting an orphaned or
 * least-recently-used cloned voice. Reconciles DB↔EL drift along the way:
 *
 *   1. List real custom voices on EL (source of truth for the slot count).
 *      Premade voices don't count toward the limit, so we ignore them.
 *   2. Reconcile DB → EL: any UserVoice with `externalId` pointing to a
 *      voice that is no longer on EL (deleted via EL UI, evicted by another
 *      worker / account, lost during partial sync) gets its externalId
 *      cleared. The original audio in `audioS3Key` is preserved so the
 *      voice can be re-cloned on next TTS use via `resolveVoiceForTTS`.
 *   3. Pick a deletion target — prefer **untracked** EL voices first
 *      (orphans from deleted DB users / direct EL UI / failed-write
 *      partial state) since deleting them doesn't penalize any current
 *      user. If none, fall back to the LRU among DB-tracked voices.
 *   4. Delete from EL. `deleteVoice` returns true even on 404 so an
 *      already-gone voice is treated as "slot already free". On a tracked
 *      hit we clear the DB externalId.
 *
 * Returns true when at least one slot was freed (incl. drift cleanup).
 */
async function evictOneElevenLabsVoice(apiKey: string, keyId: string | null): Promise<boolean> {
  let elVoices: Awaited<ReturnType<typeof ElevenLabsAdapter.listVoices>>;
  try {
    elVoices = await ElevenLabsAdapter.listVoices(apiKey);
  } catch (e) {
    logger.error({ err: e }, "Voice eviction: failed to list ElevenLabs voices");
    return false;
  }

  // Only cloned/generated voices occupy the custom-voice limit (premade does not).
  const deletable = elVoices.filter((v) => v.category === "cloned" || v.category === "generated");
  const deletableIds = new Set(deletable.map((v) => v.voice_id));

  // ── Step 2: reconcile DB → EL drift, scoped to THIS account ────────────
  // EL voice_id lives per-account, so we can only judge "stale" for DB
  // records whose `providerKeyId` matches the current key (or both are
  // null = env-fallback path). Cross-account records (other pool keys)
  // are left alone — they're valid on their own account.
  const allDbTracked = await db.userVoice.findMany({
    where: {
      provider: "elevenlabs",
      externalId: { not: null },
      providerKeyId: keyId,
    },
    select: { id: true, externalId: true },
  });
  const staleDbIds = allDbTracked
    .filter((r) => r.externalId && !deletableIds.has(r.externalId))
    .map((r) => r.id);
  if (staleDbIds.length > 0) {
    await db.userVoice
      .updateMany({
        where: { id: { in: staleDbIds } },
        data: { externalId: null },
      })
      .catch((e) =>
        logger.error(
          { err: e, count: staleDbIds.length },
          "Voice eviction: stale-DB cleanup failed",
        ),
      );
    logger.info(
      { count: staleDbIds.length, keyId },
      "Voice eviction: cleared stale DB externalIds",
    );
  }

  if (deletable.length === 0) {
    logger.warn("Voice eviction: ElevenLabs returned no deletable voices");
    // Still report success if drift cleanup happened — caller may now have
    // room indirectly (their next clone will hit a slot freed elsewhere).
    return staleDbIds.length > 0;
  }

  // ── Step 3: pick a target ──────────────────────────────────────────────
  // Tracked records (voice still on EL AND in our DB), ordered for LRU pick.
  const trackedRecords = await db.userVoice.findMany({
    where: { provider: "elevenlabs", externalId: { in: [...deletableIds] } },
    orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true, externalId: true },
  });
  const trackedExternalIds = new Set(
    trackedRecords.map((r) => r.externalId).filter((id): id is string => !!id),
  );
  const untracked = deletable.filter((v) => !trackedExternalIds.has(v.voice_id));

  let targetExternalId: string | null = null;
  let targetDbId: string | null = null;

  if (untracked.length > 0) {
    // Orphans — evict the oldest. No DB row to update.
    const oldest = [...untracked].sort(
      (a, b) => (a.created_at_unix ?? 0) - (b.created_at_unix ?? 0),
    )[0];
    targetExternalId = oldest.voice_id;
    logger.info(
      { voiceId: targetExternalId, name: oldest.name },
      "Voice eviction: deleting untracked orphan (drift cleanup)",
    );
  } else if (trackedRecords.length > 0) {
    targetExternalId = trackedRecords[0].externalId;
    targetDbId = trackedRecords[0].id;
  }

  if (!targetExternalId) return staleDbIds.length > 0;

  // ── Step 4: delete on EL + sync DB ─────────────────────────────────────
  const deleted = await ElevenLabsAdapter.deleteVoice(targetExternalId, apiKey);
  if (!deleted) {
    // Hard failure (network / 5xx). DB unchanged; caller can retry.
    return staleDbIds.length > 0;
  }

  if (targetDbId) {
    await db.userVoice
      .update({ where: { id: targetDbId }, data: { externalId: null } })
      .catch((e) =>
        logger.error({ err: e, id: targetDbId }, "Voice eviction: failed to clear DB externalId"),
      );
  }

  logger.info({ voiceId: targetExternalId }, "Voice eviction: freed one ElevenLabs slot");
  return true;
}

// ── Incoming prompt in AUDIO_ACTIVE state ─────────────────────────────────────

/**
 * Executes a text prompt in the active audio session.
 * Used by handleAudioMessage (text) and the voice-prompt callback.
 */
export async function executeAudioPrompt(ctx: BotContext, prompt: string): Promise<void> {
  if (!ctx.user) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const modelId = state?.audioModelId ?? "tts-openai";

  const pendingMsg = await ctx.reply(ctx.t.audio.processing);

  try {
    await audioGenerationService.submitAudio({
      userId: ctx.user.id,
      modelId,
      prompt,
      telegramChatId: chatId,
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
      logger.error(err, "Audio message error");
      await ctx.reply(ctx.t.audio.generationFailed);
    }
  }
}

export async function handleAudioMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  await executeAudioPrompt(ctx, ctx.message.text);
}

export async function handleAudioVoice(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await transcribeAndReply(ctx, "audio");
}
