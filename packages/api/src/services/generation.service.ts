import { db } from "../db.js";
import { createImageAdapter } from "../ai/image/factory.js";
import { uploadFromUrl } from "../storage/s3.client.js";
import { getImageQueue } from "../queues/image.queue.js";
import { AI_MODELS } from "@metabox/shared";

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

    // Create DB job record
    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: "", // will be set by caller if needed
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
        const s3Url = await uploadFromUrl(result.url, "images");

        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "done", outputUrl: s3Url, completedAt: new Date() },
        });

        return { dbJobId: job.id, imageUrl: s3Url, isPending: false };
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
