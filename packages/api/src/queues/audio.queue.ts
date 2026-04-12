import { Queue } from "bullmq";
import { getRedis } from "../redis.js";

export interface AudioJobData {
  /** GenerationJob.id in DB */
  dbJobId: string;
  /** BigInt userId serialised as string */
  userId: string;
  modelId: string;
  prompt: string;
  /** Optional voice ID (ElevenLabs / OpenAI) */
  voiceId?: string;
  /** Optional source audio URL for voice cloning */
  sourceAudioUrl?: string;
  /** Telegram chat id to notify when done */
  telegramChatId: number;
  /** Per-model user settings (voice, speed, stability, etc.) */
  modelSettings?: Record<string, unknown>;
  /** Job pipeline stage. `"generate"` (default) submits; `"poll"` checks status. */
  stage?: "generate" | "poll";
  /** Epoch ms timestamp when polling started. */
  pollStartedAt?: number;
  /** Last poll interval used, so we can detect interval tier changes. */
  lastIntervalMs?: number;
}

export function getAudioQueue(): Queue<AudioJobData> {
  return new Queue<AudioJobData>("audio", { connection: getRedis() });
}
