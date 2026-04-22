import { getRedis } from "@metabox/api/redis";

/**
 * Atomically acquires a Redis lock using SET NX EX.
 * Returns true if the lock was acquired (first caller), false if it already existed.
 */
export async function acquireLock(key: string, ttlSec: number): Promise<boolean> {
  const result = await getRedis().set(key, "1", "EX", ttlSec, "NX");
  return result === "OK";
}

/**
 * Releases a Redis lock. Call on error paths to allow retries.
 * On success paths prefer to let the TTL expire naturally.
 */
export async function releaseLock(key: string): Promise<void> {
  await getRedis().del(key);
}
