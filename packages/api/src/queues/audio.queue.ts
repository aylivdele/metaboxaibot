import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@metabox/shared";

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

let _connection: Redis | undefined;

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export function getAudioQueue(): Queue<AudioJobData> {
  return new Queue<AudioJobData>("audio", { connection: getConnection() });
}
