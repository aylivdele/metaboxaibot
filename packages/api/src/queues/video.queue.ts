import { Queue } from "bullmq";
import { Redis } from "ioredis";

export interface VideoJobData {
  /** GenerationJob.id in DB */
  dbJobId: string;
  /** BigInt userId serialised as string */
  userId: string;
  modelId: string;
  prompt: string;
  /** Optional source image URL for image-to-video */
  imageUrl?: string;
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

export function getVideoQueue(): Queue<VideoJobData> {
  return new Queue<VideoJobData>("video", { connection: getConnection() });
}
