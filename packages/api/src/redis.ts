import { Redis } from "ioredis";
import { config } from "@metabox/shared";

let _connection: Redis | undefined;

/**
 * Process-wide IORedis singleton. Reused by every queue, throttle service,
 * and any other Redis consumer in @metabox/api. Uses `maxRetriesPerRequest: null`
 * which BullMQ requires for blocking commands.
 */
export function getRedis(): Redis {
  if (!_connection) {
    _connection = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}
