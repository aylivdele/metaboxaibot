/**
 * Provider temporarily unavailable: server-side overload, signaled by the
 * provider in the response message (e.g. KIE 422 "Service is currently
 * unavailable due to high demand. Please try again later. (E003)").
 *
 * Семантически отличается от rate-limit:
 *  - rate-limit = "ты слишком часто" → defer на cooldown'е, retry с тем же
 *    или другим ключом провайдера часто помогает (per-key throttle).
 *  - provider unavailable = "наш узел перегружен" → ни ключи провайдера, ни
 *    cooldown не помогут. Рациональная реакция — переключиться на fallback
 *    провайдера (другую модель), если зарегистрирован.
 *
 * Эти паттерны ТАКЖЕ присутствуют в `RATE_LIMIT_PATTERNS` — это намеренно:
 *  - Если у модели есть fallback-кандидат, processor поймает через
 *    `isProviderTemporaryUnavailable` ПЕРВЫМ и переключится на fallback.
 *  - Если fallback'а нет, fall-through сработает на rate-limit defer цикл
 *    (5×60s) → существующее поведение сохранено для legacy моделей.
 */
export function isProviderTemporaryUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string };
  const msg = typeof e.message === "string" ? e.message : "";
  return /high demand|service is (currently )?unavailable|service unavailable/i.test(msg);
}
