import { db } from "../db.js";
import { getImageQueue } from "../queues/image.queue.js";
import { AI_MODELS, ONE_SHOT_SETTING_KEYS } from "@metabox/shared";
import { checkBalance, calculateCost } from "./token.service.js";
import { userStateService } from "./user-state.service.js";

/**
 * Strip one-shot (per-generation) fields from a `modelSettings` snapshot
 * before persisting it into `GenerationJob.inputData.modelSettings`. The
 * runtime object passed to queue workers is left untouched — only the
 * history copy is sanitised so stale upload URLs don't pollute the
 * gallery's "Apply settings" flow.
 */
function stripOneShotKeys(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (ONE_SHOT_SETTING_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export interface SubmitImageParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  /** Named media input slots: { [slotKey]: string[] } */
  mediaInputs?: Record<string, string[]>;
  telegramChatId: number;
  /** If set, user/assistant messages are saved to this dialog for img2img context. */
  dialogId?: string;
  /** Pre-translated label for the "Send as file" inline button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9", "1:1". */
  aspectRatio?: string;
  /** "{chatId}:{messageId}" of the inline button that triggered this job. Used for dedup. */
  sourceMessageId?: string;
}

export interface SubmitImageResult {
  dbJobId: string;
}

export const generationService = {
  async hasActiveJobForSource(userId: bigint, sourceMessageId: string): Promise<boolean> {
    const existing = await db.generationJob.findFirst({
      where: { userId, sourceMessageId, status: { in: ["pending", "processing"] } },
      select: { id: true },
    });
    return existing !== null;
  },

  /**
   * Fetch a generation output by ID (for refine / download buttons).
   * Also supports legacy jobId lookup (old buttons sent before migration).
   */
  async getOutputById(
    id: string,
  ): Promise<{ s3Key: string | null; modelId: string; section: string } | null> {
    // Try as output ID first
    let output = await db.generationJobOutput.findUnique({
      where: { id },
      include: { job: { select: { modelId: true, section: true } } },
    });
    if (output) {
      return { s3Key: output.s3Key, modelId: output.job.modelId, section: output.job.section };
    }

    // Fallback: treat as jobId (for old buttons sent before migration)
    output = await db.generationJobOutput.findFirst({
      where: { jobId: id, index: 0 },
      include: { job: { select: { modelId: true, section: true } } },
    });
    if (output) {
      return { s3Key: output.s3Key, modelId: output.job.modelId, section: output.job.section };
    }

    return null;
  },

  async submitImage(params: SubmitImageParams): Promise<SubmitImageResult> {
    const {
      userId,
      modelId,
      prompt,
      negativePrompt,
      sourceImageUrl,
      telegramChatId,
      dialogId,
      sendOriginalLabel,
      aspectRatio,
    } = params;

    const model = AI_MODELS[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const allModelSettings = await userStateService.getModelSettings(userId);
    const modelSettings = allModelSettings[modelId] ?? {};
    // Prefer aspect_ratio from modelSettings (set via webapp) over legacy param
    const effectiveAspectRatio = (modelSettings.aspect_ratio as string | undefined) ?? aspectRatio;

    // For per-megapixel models assume 1 MP (typical for most image resolutions)
    const estimatedMegapixels = model.costUsdPerMPixel ? 1.0 : undefined;
    const estimatedCost = calculateCost(model, 0, 0, estimatedMegapixels, undefined, modelSettings);
    await checkBalance(userId, estimatedCost);

    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: dialogId ?? "",
        section: "image",
        modelId,
        prompt,
        inputData: {
          ...(negativePrompt ? { negativePrompt } : {}),
          ...(params.mediaInputs ? { mediaInputs: params.mediaInputs } : {}),
          ...(() => {
            const historySettings = stripOneShotKeys(modelSettings as Record<string, unknown>);
            return Object.keys(historySettings).length > 0
              ? {
                  modelSettings: historySettings as Record<
                    string,
                    string | number | boolean | null
                  >,
                }
              : {};
          })(),
        },
        status: "pending",
        ...(params.sourceMessageId ? { sourceMessageId: params.sourceMessageId } : {}),
      },
    });

    const queue = getImageQueue();
    await queue.add(
      "generate",
      {
        dbJobId: job.id,
        userId: userId.toString(),
        modelId,
        prompt,
        negativePrompt,
        sourceImageUrl,
        mediaInputs: params.mediaInputs,
        telegramChatId,
        dialogId,
        sendOriginalLabel,
        aspectRatio: effectiveAspectRatio,
        modelSettings,
      },
      {
        jobId: job.id,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );

    return { dbJobId: job.id };
  },
};
