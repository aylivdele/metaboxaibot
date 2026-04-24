import { db } from "../db.js";
import { getVideoQueue } from "../queues/video.queue.js";
import { AI_MODELS, ONE_SHOT_SETTING_KEYS } from "@metabox/shared";
import { checkBalance, calculateCost, computeVideoTokens } from "./token.service.js";
import { userStateService } from "./user-state.service.js";
import { createVideoAdapter } from "../ai/video/factory.js";
import { getFileUrl } from "./s3.service.js";
import { probeAudioDurationSec } from "../utils/audio-transcode.js";
import { logger } from "../logger.js";
import type {
  VideoInput,
  VideoValidationContext,
  VideoValidationError,
} from "../ai/video/base.adapter.js";

/** Drop one-shot upload fields (avatar_photo_*, voice_*, …) from the history
 * snapshot so `inputData.modelSettings` stays clean of per-generation noise. */
function stripOneShotKeys(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (ONE_SHOT_SETTING_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * For HeyGen lip-sync (audio_asset_id flow) the output video length equals
 * the input audio length, and HeyGen bills per second. Without measuring
 * the audio up-front a user could submit a 10-minute file with a balance
 * sufficient for 5 seconds — generation succeeds, balance goes negative.
 *
 * Returns the audio duration in seconds, or `null` when no input audio is
 * present / probing fails (caller falls back to the model default).
 */
async function probeHeygenAudioDuration(
  modelSettings: Record<string, unknown>,
  mediaInputs: Record<string, string[]> | undefined,
): Promise<number | null> {
  // Source priority matches video.processor.ts/heygen.adapter.ts: explicit
  // voice asset (s3 first, then provider URL) → media input slots.
  const s3Key = (modelSettings.voice_s3key as string | undefined)?.trim();
  const explicitUrl = (modelSettings.voice_url as string | undefined)?.trim();
  const mediaUrl = mediaInputs?.driving_audio?.[0] ?? mediaInputs?.reference_audios?.[0] ?? null;

  let url: string | null = null;
  if (s3Key) url = await getFileUrl(s3Key).catch(() => null);
  if (!url && explicitUrl) url = explicitUrl;
  if (!url && mediaUrl) url = mediaUrl;
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await probeAudioDurationSec(buf);
  } catch (err) {
    logger.warn({ err }, "probeHeygenAudioDuration: failed to fetch/probe input audio");
    return null;
  }
}

export interface SubmitVideoParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  imageUrl?: string;
  /** Named media input slots: { [slotKey]: string[] } */
  mediaInputs?: Record<string, string[]>;
  telegramChatId: number;
  /** Pre-translated label for the "Send as file" inline button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9". */
  aspectRatio?: string;
  /** Clip duration in seconds chosen by user. */
  duration?: number;
  /** One-shot overrides merged on top of saved modelSettings (e.g. driver_url from uploaded video). */
  extraModelSettings?: Record<string, unknown>;
  /** "{chatId}:{messageId}" of the inline button that triggered this job. Used for dedup. */
  sourceMessageId?: string;
}

export interface SubmitVideoResult {
  dbJobId: string;
  isPending: true;
}

export interface ValidateVideoParams {
  modelId: string;
  prompt: string;
  imageUrl?: string;
  aspectRatio?: string;
  duration?: number;
  modelSettings?: Record<string, unknown>;
  userId?: bigint;
}

export const videoGenerationService = {
  /**
   * Runs adapter-level pre-generation checks (e.g. Veo image→8s, HeyGen avatar+voice,
   * Runway requires image). Returns a `VideoValidationError` when the request should
   * be aborted, or `null` when it can proceed. Safe to call before `submitVideo`.
   */
  validateVideoRequest(
    params: ValidateVideoParams,
    ctx?: VideoValidationContext,
  ): VideoValidationError | null {
    const adapter = createVideoAdapter(params.modelId);
    if (!adapter.validateRequest) return null;
    const input: VideoInput = {
      prompt: params.prompt,
      imageUrl: params.imageUrl,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      modelSettings: params.modelSettings,
      userId: params.userId,
    };
    return adapter.validateRequest(input, ctx);
  },

  async submitVideo(params: SubmitVideoParams): Promise<SubmitVideoResult> {
    const {
      userId,
      modelId,
      prompt,
      imageUrl,
      telegramChatId,
      sendOriginalLabel,
      aspectRatio,
      duration,
      extraModelSettings,
    } = params;

    const model = AI_MODELS[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const allModelSettings = await userStateService.getModelSettings(userId);
    const modelSettings = { ...(allModelSettings[modelId] ?? {}), ...extraModelSettings };
    // Prefer values from modelSettings (set via webapp) over legacy params
    const effectiveAspectRatio = (modelSettings.aspect_ratio as string | undefined) ?? aspectRatio;
    let effectiveDuration =
      (modelSettings.duration as number | undefined) ??
      duration ??
      model.durationRange?.min ??
      model.supportedDurations?.[0] ??
      5;

    // HeyGen output length is data-driven (lip-sync = input audio length;
    // TTS = how long it takes to read the script). Both billed per second
    // via `costUsdPerSecond`. Without measuring up-front a user could
    // submit a 10-minute audio or a 5000-character script with a balance
    // sufficient for 5 seconds and still get the generation through.
    if (modelId === "heygen") {
      const audioSec = await probeHeygenAudioDuration(modelSettings, params.mediaInputs);
      if (audioSec !== null) {
        // Lip-sync path — exact length is known.
        effectiveDuration = Math.ceil(audioSec);
        logger.info(
          { modelId, audioSec, effectiveDuration },
          "HeyGen pre-flight: using probed audio duration for cost estimate",
        );
      } else if (prompt) {
        // TTS path — no input audio, HeyGen will read `prompt` aloud. We
        // don't know the exact synthesis length, but a conservative
        // characters-per-second estimate keeps the balance check honest.
        // ~14 ch/s ≈ 150 wpm (typical TTS speed for both EN and RU). Slow
        // voice settings will produce *longer* output → using 14 here
        // under-estimates slightly; clamp to floor 5s so very short
        // prompts still hit a sane minimum charge.
        const TTS_CHARS_PER_SEC = 14;
        const estimatedSec = Math.max(5, Math.ceil(prompt.length / TTS_CHARS_PER_SEC));
        effectiveDuration = estimatedSec;
        logger.info(
          { modelId, promptChars: prompt.length, effectiveDuration },
          "HeyGen pre-flight: using TTS-from-prompt duration estimate",
        );
      }
    }

    const estimatedVideoTokens = model.costUsdPerMVideoToken
      ? computeVideoTokens(
          model,
          effectiveAspectRatio,
          effectiveDuration,
          undefined,
          undefined,
          undefined,
          modelSettings.resolution as string | undefined,
        )
      : undefined;
    const estimatedCost = calculateCost(
      model,
      0,
      0,
      undefined,
      estimatedVideoTokens,
      modelSettings,
      effectiveDuration,
    );
    await checkBalance(userId, estimatedCost);

    // Create DB job record
    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: "",
        section: "video",
        modelId,
        prompt,
        inputData: {
          ...(imageUrl ? { imageUrl } : {}),
          ...(params.mediaInputs ? { mediaInputs: params.mediaInputs } : {}),
          ...(() => {
            const historySettings = stripOneShotKeys(
              modelSettings as unknown as Record<string, unknown>,
            );
            return Object.keys(historySettings).length > 0
              ? { modelSettings: JSON.parse(JSON.stringify(historySettings)) }
              : {};
          })(),
        },
        status: "pending",
        ...(params.sourceMessageId ? { sourceMessageId: params.sourceMessageId } : {}),
      },
    });

    // All video models are async — enqueue for worker
    const queue = getVideoQueue();
    await queue.add(
      "generate",
      {
        dbJobId: job.id,
        userId: userId.toString(),
        modelId,
        prompt,
        imageUrl,
        mediaInputs: params.mediaInputs,
        telegramChatId,
        sendOriginalLabel,
        aspectRatio: effectiveAspectRatio,
        duration: effectiveDuration,
        modelSettings,
      },
      {
        jobId: job.id,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 10000 },
      },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
