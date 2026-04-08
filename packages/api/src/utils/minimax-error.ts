/**
 * Structured MiniMax API error handling.
 *
 * Errors come in base_resp: { status_code: number, status_msg: string }
 * or as poll failure with error_message string.
 */

export class MinimaxApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly statusMsg: string,
  ) {
    super(`MiniMax [${statusCode}]: ${statusMsg}`);
    this.name = "MinimaxApiError";
  }
}

// ── Classification ────────────────────────────────────────────────────────────

/** Codes that indicate a user input problem — no retry, show message to user. */
const USER_FACING_CODES = new Set([
  1026, // sensitive content in prompt
  1027, // sensitive content in output
  1042, // invisible character ratio limit
  2013, // invalid params
  2056, // usage limit exceeded (user-visible quota)
]);

export function isMinimaxUserFacingError(err: unknown): err is MinimaxApiError {
  return err instanceof MinimaxApiError && USER_FACING_CODES.has(err.statusCode);
}

export function getMinimaxUserMessage(err: MinimaxApiError): string {
  switch (err.statusCode) {
    case 1026:
    case 1027:
      return "❌ Запрос содержит недопустимый контент. Измените описание и попробуйте снова.";
    case 1042:
      return "❌ Запрос содержит невидимые или недопустимые символы. Проверьте текст и попробуйте снова.";
    case 2013:
      return "❌ Некорректные параметры запроса. Проверьте настройки модели и попробуйте снова.";
    case 2056:
      return "❌ Превышен лимит использования MiniMax. Попробуйте позже.";
    default:
      return "❌ MiniMax отклонил запрос. Проверьте настройки и попробуйте снова.";
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** Parse base_resp from any MiniMax response body. */
export function parseMinimaxBaseResp(baseResp: unknown): MinimaxApiError | null {
  if (!baseResp || typeof baseResp !== "object") return null;
  const r = baseResp as Record<string, unknown>;
  if (typeof r.status_code !== "number" || r.status_code === 0) return null;
  return new MinimaxApiError(r.status_code, String(r.status_msg ?? ""));
}
