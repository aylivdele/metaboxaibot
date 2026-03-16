import { db } from "../db.js";
import { getVideoQueue } from "../queues/video.queue.js";
import { AI_MODELS } from "@metabox/shared";
import { checkBalance } from "./token.service.js";

export interface SubmitVideoParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  imageUrl?: string;
  telegramChatId: number;
}

export interface SubmitVideoResult {
  dbJobId: string;
  isPending: true;
}

export const videoGenerationService = {
  async submitVideo(params: SubmitVideoParams): Promise<SubmitVideoResult> {
    const { userId, modelId, prompt, imageUrl, telegramChatId } = params;

    const model = AI_MODELS[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    await checkBalance(userId);

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
      },
      { attempts: 3, backoff: { type: "exponential", delay: 10000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
