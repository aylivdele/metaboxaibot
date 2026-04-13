import { Queue } from "bullmq";
import { getRedis } from "../redis.js";

export interface ImageJobData {
  /** GenerationJob.id in DB */
  dbJobId: string;
  /** BigInt userId serialised as string */
  userId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  /** Named media input slots: { [slotKey]: string[] } */
  mediaInputs?: Record<string, string[]>;
  /** Telegram chat id to notify when done */
  telegramChatId: number;
  /** Dialog.id for saving messages and enabling img2img context. */
  dialogId?: string;
  /** Pre-translated label for the "Send as file" button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9", "1:1". */
  aspectRatio?: string;
  /** Per-model user settings (inference steps, style, seed, etc.) */
  modelSettings?: Record<string, unknown>;
  /** Job pipeline stage. `"generate"` (default) submits; `"poll"` checks status. */
  stage?: "generate" | "poll";
  /** Epoch ms timestamp when polling started (stage transitions from generate → poll). */
  pollStartedAt?: number;
  /** Last poll interval used, so we can detect interval tier changes. */
  lastIntervalMs?: number;
}

export function getImageQueue(): Queue<ImageJobData> {
  return new Queue<ImageJobData>("image", { connection: getRedis() });
}
