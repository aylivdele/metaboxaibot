/**
 * `withProviderKey` — обёртка вокруг работы с одним выбранным API-ключом.
 *
 * 1. Берёт ключ из пула (`acquireKey(provider)`), бросает PoolExhaustedError
 *    если все throttled.
 * 2. Пробрасывает выбранный AdapterContext в callback (apiKey + опциональный proxy).
 * 3. На успехе — `recordSuccess(keyId)`; на ошибке — классифицирует через
 *    `classifyRateLimit` и либо `markRateLimited`, либо `recordError`.
 * 4. Возвращает результат + использованный keyId (для сохранения в БД, если
 *    предстоит staged poll по тому же ключу).
 *
 * Если `keyId === null` (env-fallback) — метрики не пишем, throttle не ставим;
 * env-ключ один на провайдер, защищать его в Redis-gate можно через старый
 * `tripThrottle(modelId)` в адаптере.
 */
import {
  acquireKey,
  markRateLimited,
  recordSuccess,
  recordError,
} from "../services/key-pool.service.js";
import type { AcquiredKey } from "../services/key-pool.service.js";
import { classifyRateLimit } from "../utils/rate-limit-error.js";

/** Контекст, который фабрика адаптера получает извне (вместо config.ai.*). */
export type AdapterContext = AcquiredKey;

export interface WithProviderKeyResult<T> {
  result: T;
  keyId: string | null;
}

export async function withProviderKey<T>(
  provider: string,
  fn: (ctx: AdapterContext) => Promise<T>,
): Promise<WithProviderKeyResult<T>> {
  const acquired = await acquireKey(provider);
  try {
    const result = await fn(acquired);
    if (acquired.keyId) {
      // Best-effort, не дожидаемся.
      void recordSuccess(acquired.keyId);
    }
    return { result, keyId: acquired.keyId };
  } catch (err) {
    if (acquired.keyId) {
      const cls = classifyRateLimit(err, provider);
      if (cls.isRateLimit) {
        void markRateLimited(acquired.keyId, cls.cooldownMs, cls.reason);
      } else {
        void recordError(acquired.keyId, err instanceof Error ? err.message : String(err));
      }
    }
    throw err;
  }
}
