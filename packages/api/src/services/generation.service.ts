import { db } from "../db.js";
import { createImageAdapter } from "../ai/image/factory.js";
import { getImageQueue } from "../queues/image.queue.js";
import { AI_MODELS } from "@metabox/shared";
import { checkBalance, deductTokens, calculateCost } from "./token.service.js";
import { buildS3Key, sectionMeta, uploadFromUrl } from "./s3.service.js";

export interface SubmitImageParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  telegramChatId: number;
}

export interface SubmitImageResult {
  dbJobId: string;
  /** Populated immediately for sync models (dall-e). */
  imageUrl?: string;
  isPending: boolean;
}

export const generationService = {
  async submitImage(params: SubmitImageParams): Promise<SubmitImageResult> {
    const { userId, modelId, prompt, negativePrompt, sourceImageUrl, telegramChatId } = params;

    const model = AI_MODELS[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    await checkBalance(userId);

    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: "",
        section: "image",
        modelId,
        prompt,
        inputData: negativePrompt ? { negativePrompt } : undefined,
        status: "pending",
      },
    });

    const adapter = createImageAdapter(modelId);

    if (!adapter.isAsync && adapter.generate) {
      // ── Sync generation (DALL-E 3) ──────────────────────────────────────
      try {
        const result = await adapter.generate({ prompt, negativePrompt, imageUrl: sourceImageUrl });

        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "done", outputUrl: result.url, completedAt: new Date() },
        });

        await deductTokens(userId, calculateCost(model), modelId);

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

        return { dbJobId: job.id, imageUrl: result.url, isPending: false };
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
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
