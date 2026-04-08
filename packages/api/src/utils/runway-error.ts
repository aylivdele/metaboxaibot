/**
 * Structured Runway task failure handling.
 *
 * Failures come from poll: task.failureCode (machine-readable) + task.failure (human string).
 * HTTP errors on submit are plain { error: string } bodies.
 */

export class RunwayTaskError extends Error {
  constructor(
    /** Machine-readable failureCode from Runway, e.g. "SAFETY.INPUT.TEXT". Null if not provided. */
    public readonly failureCode: string | null,
    /** Human-readable failure string from Runway. */
    public readonly failureMessage: string,
  ) {
    super(`Runway [${failureCode ?? "null"}]: ${failureMessage}`);
    this.name = "RunwayTaskError";
  }
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Returns true for failures that originate from bad user input
 * (content moderation on input, bad asset, or input text preprocessing).
 * These should not be retried.
 */
export function isRunwayUserFacingError(err: unknown): err is RunwayTaskError {
  if (!(err instanceof RunwayTaskError)) return false;
  const code = err.failureCode ?? "";
  return (
    code.startsWith("SAFETY.INPUT.") ||
    code === "INPUT_PREPROCESSING.SAFETY.TEXT" ||
    code === "ASSET.INVALID"
  );
}

export function getRunwayUserMessage(err: RunwayTaskError): string {
  const code = err.failureCode ?? "";

  if (code.startsWith("SAFETY.INPUT.") || code === "INPUT_PREPROCESSING.SAFETY.TEXT") {
    return "❌ Запрос или изображение не прошли проверку модерации Runway. Измените запрос или используйте другое изображение.";
  }
  if (code === "ASSET.INVALID") {
    return "❌ Изображение не подходит для генерации видео. Проверьте размеры, формат и попробуйте другое фото.";
  }
  return "❌ Runway отклонил запрос. Проверьте настройки и попробуйте снова.";
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** Wrap poll task failure fields into a structured error. */
export function parseRunwayTaskFailure(
  failureCode: string | null | undefined,
  failure: string | null | undefined,
): RunwayTaskError {
  return new RunwayTaskError(failureCode ?? null, failure ?? "unknown");
}
