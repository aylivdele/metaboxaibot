import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@metabox/shared";

export interface ImageJobData {
  /** GenerationJob.id in DB */
  dbJobId: string;
  /** BigInt userId serialised as string */
  userId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  /** Telegram chat id to notify when done */
  telegramChatId: number;
  /** Dialog.id for saving messages and enabling img2img context. */
  dialogId?: string;
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

export function getImageQueue(): Queue<ImageJobData> {
  return new Queue<ImageJobData>("image", { connection: getConnection() });
}
