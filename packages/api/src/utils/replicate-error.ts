/**
 * Structured error handling for Replicate prediction failures.
 *
 * Replicate embeds error codes in the format E#### inside prediction.error strings.
 * User-facing codes are those caused by user input (file size, invalid params, OOM from large input).
 * All other codes are tech/infrastructure errors that should trigger a tech alert.
 */

/** Codes that indicate a user-correctable problem. */
const USER_FACING_CODES = new Set(["E1001", "E9243", "E9825"]);

const CODE_MESSAGES: Record<string, string> = {
  /** OOM — input too large */
  E1001:
    "Входные данные слишком большие для модели. Попробуйте уменьшить изображение или длину текста.",
  /** Error starting prediction — invalid input parameters */
  E9243:
    "Ошибка запуска генерации: некорректные параметры. Проверьте настройки и повторите попытку.",
  /** Failed to upload file — file too large or bad format */
  E9825:
    "Не удалось загрузить файл для генерации. Проверьте размер (обычно до 50 МБ) и формат файла.",
};

export class ReplicatePredictionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReplicatePredictionError";
  }
}

/**
 * Parses a failed/canceled prediction into a typed error.
 * Extracts the E#### code from the error string if present; falls back to E1000 (unknown).
 */
export function parseReplicatePredictionFailure(
  error: unknown,
  status: string,
): ReplicatePredictionError {
  const errorStr = String(error ?? "");
  const codeMatch = errorStr.match(/\bE\d{4}\b/);
  const code = codeMatch ? codeMatch[0] : "E1000";
  return new ReplicatePredictionError(code, `Replicate prediction ${status}: ${errorStr}`);
}

export function isReplicateUserFacingError(err: unknown): err is ReplicatePredictionError {
  return err instanceof ReplicatePredictionError && USER_FACING_CODES.has(err.code);
}

export function getReplicateUserMessage(err: ReplicatePredictionError): string {
  return CODE_MESSAGES[err.code] ?? "Произошла ошибка при генерации. Попробуйте снова.";
}
