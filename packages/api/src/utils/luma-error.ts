/**
 * Structured Luma Dream Machine error handling.
 *
 * Submit errors:  { detail: string }
 * Poll failures:  generation.failure_reason (string)
 */

export class LumaApiError extends Error {
  constructor(
    /** Original detail/failure_reason string from Luma. */
    public readonly detail: string,
    /** "submit" | "poll" — where the error originated. */
    public readonly source: "submit" | "poll",
  ) {
    super(`Luma [${source}]: ${detail}`);
    this.name = "LumaApiError";
  }
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Substrings that indicate a user-facing error (bad input / moderation).
 * Checked against the lowercased detail/failure_reason string.
 */
const USER_FACING_PATTERNS: string[] = [
  // Moderation
  "blacklisted words",
  "frame moderation failed",
  "advanced prompt moderation failed",
  "failed to read user input frames",
  // Prompt validation (submit)
  "prompt is required",
  "prompt is too short",
  "prompt is too long",
  // Input/keyframe logic errors
  "loop is not supported",
  "no keyframes provided",
  "unknown request type",
];

export function isLumaUserFacingError(err: unknown): err is LumaApiError {
  if (!(err instanceof LumaApiError)) return false;
  const lower = err.detail.toLowerCase();
  return USER_FACING_PATTERNS.some((p) => lower.includes(p));
}

/** Returns a Russian user-facing message for a Luma user-facing error. */
export function getLumaUserMessage(err: LumaApiError): string {
  const lower = err.detail.toLowerCase();

  if (lower.includes("blacklisted words"))
    return "❌ Запрос содержит запрещённые слова. Измените описание и попробуйте снова.";
  if (lower.includes("frame moderation failed"))
    return "❌ Изображение не прошло проверку модерации. Используйте другое фото.";
  if (lower.includes("advanced prompt moderation failed"))
    return "❌ Запрос отклонён системой модерации. Измените описание и попробуйте снова.";
  if (lower.includes("failed to read user input frames"))
    return "❌ Не удалось загрузить изображение. Убедитесь, что файл доступен, и попробуйте снова.";
  if (lower.includes("prompt is required"))
    return "❌ Текстовый запрос обязателен. Добавьте описание и попробуйте снова.";
  if (lower.includes("prompt is too short"))
    return "❌ Запрос слишком короткий (минимум 3 символа). Добавьте больше деталей.";
  if (lower.includes("prompt is too long"))
    return "❌ Запрос слишком длинный (максимум 5000 символов). Сократите описание.";
  if (lower.includes("loop is not supported"))
    return "❌ Параметр «зацикливание» несовместим с выбранными настройками. Отключите его и попробуйте снова.";
  if (lower.includes("no keyframes provided"))
    return "❌ Не указаны ключевые кадры. Проверьте настройки и попробуйте снова.";
  if (lower.includes("unknown request type"))
    return "❌ Неверный тип запроса. Проверьте настройки модели.";

  return "❌ Luma отклонила запрос. Проверьте настройки и попробуйте снова.";
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** Parse HTTP error body: { detail: string }. */
export function parseLumaSubmitError(body: unknown): LumaApiError | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as Record<string, unknown>).detail;
  if (typeof detail === "string") return new LumaApiError(detail, "submit");
  return null;
}

/** Wrap a poll failure_reason string into a structured error. */
export function parseLumaPollFailure(failureReason: string | null | undefined): LumaApiError {
  return new LumaApiError(failureReason ?? "unknown", "poll");
}
