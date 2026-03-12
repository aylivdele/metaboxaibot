import { Queue } from "bullmq";
import { Redis } from "ioredis";

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
}

let _connection: Redis | undefined;

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export function getAudioQueue(): Queue<AudioJobData> {
  return new Queue<AudioJobData>("audio", { connection: getConnection() });
}
