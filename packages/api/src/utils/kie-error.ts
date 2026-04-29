/**
 * KIE-specific error helpers.
 *
 * Контекст: KIE при ошибке генерации (state==="fail" в recordInfo) НЕ перезапускает
 * генерацию на своей стороне и НЕ списывает за неудачную попытку. Если возвращён
 * 5xx-failCode — это терминальная ошибка модели, никаких retry'ев у провайдера
 * не будет. Воркер должен либо переключиться на fallback (по плану — после
 * исчерпания BullMQ retry'ев на poll-стадии), либо пометить job failed.
 *
 * Текст ошибки KIE adapter'а: `KIE ${modelId} generation failed: ${failCode} ${failMsg}`.
 * Также HTTP-уровень: `KIE * poll error ${status}` / `KIE * poll failed: ${code} — ${msg}`.
 */

/**
 * Возвращает true если ошибка — это KIE 5xx terminal failure из poll'а.
 * Используется в processor'ах для триггера re-submit на fallback.
 */
export function isKieFiveXxError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (!/^KIE\b/i.test(message)) return false;
  // Cover three KIE error shapes:
  //   "KIE foo generation failed: 500 Internal Error" (state=fail с 5xx failCode)
  //   "KIE foo poll error 502" (HTTP-уровень)
  //   "KIE foo poll failed: 503 — bad gateway" (KIE-API code 5xx)
  return /\b5\d{2}\b/.test(message);
}
