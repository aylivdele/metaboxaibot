import { db } from "../db.js";
import { createImageAdapter } from "../ai/image/factory.js";
import { getImageQueue } from "../queues/image.queue.js";
import { AI_MODELS } from "@metabox/shared";
import { checkBalance, deductTokens, calculateCost } from "./token.service.js";
import { buildS3Key, sectionMeta, uploadFromUrl } from "./s3.service.js";
import { dialogService } from "./dialog.service.js";
import { userStateService } from "./user-state.service.js";

export interface SubmitImageParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  telegramChatId: number;
  /** If set, user/assistant messages are saved to this dialog for img2img context. */
  dialogId?: string;
  /** Pre-translated label for the "Send as file" inline button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9", "1:1". */
  aspectRatio?: string;
}

export interface SubmitImageResult {
  dbJobId: string;
  /** Populated immediately for sync models (dall-e). */
  imageUrl?: string;
  isPending: boolean;
  /** Message.id of the saved assistant result (for "Refine" button). Only set for sync models when dialogId provided. */
  assistantMessageId?: string;
}

export const generationService = {
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

    await checkBalance(userId);

    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: dialogId ?? "",
        section: "image",
        modelId,
        prompt,
        inputData: negativePrompt ? { negativePrompt } : undefined,
        status: "pending",
      },
    });

    const allModelSettings = await userStateService.getModelSettings(userId);
    const modelSettings = allModelSettings[modelId] ?? {};
    // Prefer aspect_ratio from modelSettings (set via webapp) over legacy param
    const effectiveAspectRatio = (modelSettings.aspect_ratio as string | undefined) ?? aspectRatio;

    const adapter = createImageAdapter(modelId);

    if (!adapter.isAsync && adapter.generate) {
      // ── Sync generation (DALL-E 3) ──────────────────────────────────────
      try {
        const result = await adapter.generate({
          prompt,
          negativePrompt,
          imageUrl: sourceImageUrl,
          aspectRatio: effectiveAspectRatio,
          modelSettings,
        });

        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "done", outputUrl: result.url, completedAt: new Date() },
        });

        await deductTokens(userId, calculateCost(model), modelId);

        // Save messages to dialog for img2img context
        let assistantMessageId: string | undefined;
        if (dialogId && result.url) {
          await dialogService.saveMessage(dialogId, "user", prompt);
          const assistantMsg = await dialogService.saveMessage(dialogId, "assistant", "", {
            mediaUrl: result.url,
            mediaType: "image",
          });
          assistantMessageId = assistantMsg.id;
        }

        // Upload to S3 in background — do not block the response
        if (result.url) {
          const { ext, contentType } = sectionMeta("image");
          const key = buildS3Key("image", userId.toString(), job.id, ext);
          uploadFromUrl(key, result.url, contentType)
            .then((s3Key) => {
              if (s3Key) {
                return db.generationJob.update({ where: { id: job.id }, data: { s3Key } });
              }
            })
            .catch(() => void 0);
        }

        return { dbJobId: job.id, imageUrl: result.url, isPending: false, assistantMessageId };
      } catch (err) {
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "failed", error: String(err) },
        });
        throw err;
      }
    }

    // ── Async generation — enqueue for worker ─────────────────────────────
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
        telegramChatId,
        dialogId,
        sendOriginalLabel,
        aspectRatio: effectiveAspectRatio,
        modelSettings,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
