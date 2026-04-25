import { getRedis } from "../redis.js";
import { logger } from "../logger.js";

/**
 * Per-model throttle gate backed by Redis. When a provider returns a rate-limit
 * or concurrency error, callers `tripThrottle(modelId, ms, reason)` to mark the
 * model as cooling down. Subsequent submissions for the same model see the gate
 * via `checkThrottle(modelId)` and defer themselves.
 *
 * The gate uses `SET key value PX ttl NX` so that:
 *  - tripping is atomic and idempotent (only the first tripper "wins"),
 *  - notifications can be deduped (only the winner sends a tech-channel alert),
 *  - the gate auto-clears when the TTL expires (no manual cleanup).
 */

const PREFIX = "throttle:model:";
const KEY_PREFIX = "throttle:key:";

function key(modelId: string): string {
  return `${PREFIX}${modelId}`;
}

function keyKey(keyId: string): string {
  return `${KEY_PREFIX}${keyId}`;
}

export interface ThrottleStatus {
  /** Milliseconds remaining until the gate expires. Always > 0. */
  remainingMs: number;
  /** Human-readable reason recorded by the original tripper. */
  reason: string;
}

/**
 * Returns the active throttle status for a model, or null if free to submit.
 */
export async function checkThrottle(modelId: string): Promise<ThrottleStatus | null> {
  const redis = getRedis();
  const k = key(modelId);
  const [reason, pttl] = await Promise.all([redis.get(k), redis.pttl(k)]);
  if (reason === null || pttl <= 0) return null;
  return { remainingMs: pttl, reason };
}

/**
 * Atomically marks a model as throttled for `durationMs`. Returns true if this
 * caller actually set the gate (first tripper); false if a gate was already
 * present. Callers should send a tech-channel notification only when this
 * returns true.
 */
export async function tripThrottle(
  modelId: string,
  durationMs: number,
  reason: string,
): Promise<boolean> {
  if (durationMs <= 0) return false;
  const redis = getRedis();
  const result = await redis.set(key(modelId), reason, "PX", durationMs, "NX");
  const tripped = result === "OK";
  if (tripped) {
    logger.warn({ modelId, durationMs, reason }, "throttle.tripThrottle: gate set");
  }
  return tripped;
}

/**
 * Clears a throttle gate immediately. Intended for ops/manual recovery — not
 * used in the normal flow (gates expire on their own).
 */
export async function clearThrottle(modelId: string): Promise<void> {
  await getRedis().del(key(modelId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Key-level throttle (для пула API-ключей)
//
// Семантика та же что и model-level: per-key Redis-gate с атомарным `SET NX PX`.
// Используется KeyPool: при 429 от провайдера маркируем конкретный ключ как
// throttled, остальные ключи провайдера продолжают принимать нагрузку.
// ─────────────────────────────────────────────────────────────────────────────

/** Активный cooldown по ключу или null если ключ свободен. */
export async function checkKeyThrottle(keyId: string): Promise<ThrottleStatus | null> {
  const redis = getRedis();
  const k = keyKey(keyId);
  const [reason, pttl] = await Promise.all([redis.get(k), redis.pttl(k)]);
  if (reason === null || pttl <= 0) return null;
  return { remainingMs: pttl, reason };
}

/**
 * Атомарно ставит throttle на конкретный ключ. Возвращает true если cooldown
 * был установлен этим вызовом (первый tripper), false — если уже активен.
 */
export async function tripKeyThrottle(
  keyId: string,
  durationMs: number,
  reason: string,
): Promise<boolean> {
  if (durationMs <= 0) return false;
  const redis = getRedis();
  const result = await redis.set(keyKey(keyId), reason, "PX", durationMs, "NX");
  const tripped = result === "OK";
  if (tripped) {
    logger.warn({ keyId, durationMs, reason }, "throttle.tripKeyThrottle: gate set");
  }
  return tripped;
}

/** Сбросить cooldown с ключа вручную (используется admin clear-throttle endpoint). */
export async function clearKeyThrottle(keyId: string): Promise<void> {
  await getRedis().del(keyKey(keyId));
}
