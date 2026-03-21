import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@metabox/shared";

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
  /** Pre-translated label for the "Send as file" button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9". */
  aspectRatio?: string;
  /** Clip duration in seconds chosen by user. */
  duration?: number;
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

export function getVideoQueue(): Queue<VideoJobData> {
  return new Queue<VideoJobData>("video", { connection: getConnection() });
}
