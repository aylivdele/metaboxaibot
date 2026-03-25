import { db } from "../db.js";
import { getVideoQueue } from "../queues/video.queue.js";
import { AI_MODELS } from "@metabox/shared";
import { checkBalance } from "./token.service.js";
import { userStateService } from "./user-state.service.js";

export interface SubmitVideoParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  imageUrl?: string;
  telegramChatId: number;
  /** Pre-translated label for the "Send as file" inline button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9". */
  aspectRatio?: string;
  /** Clip duration in seconds chosen by user. */
  duration?: number;
  /** One-shot overrides merged on top of saved modelSettings (e.g. driver_url from uploaded video). */
  extraModelSettings?: Record<string, unknown>;
}

export interface SubmitVideoResult {
  dbJobId: string;
  isPending: true;
}

export const videoGenerationService = {
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

    await checkBalance(userId);

    const allModelSettings = await userStateService.getModelSettings(userId);
    const modelSettings = { ...(allModelSettings[modelId] ?? {}), ...extraModelSettings };
    // Prefer values from modelSettings (set via webapp) over legacy params
    const effectiveAspectRatio = (modelSettings.aspect_ratio as string | undefined) ?? aspectRatio;
    const effectiveDuration = (modelSettings.duration as number | undefined) ?? duration;

    // Create DB job record
    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: "",
        section: "video",
        modelId,
        prompt,
        inputData: imageUrl ? { imageUrl } : undefined,
        status: "pending",
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
        telegramChatId,
        sendOriginalLabel,
        aspectRatio: effectiveAspectRatio,
        duration: effectiveDuration,
        modelSettings,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 10000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
