/**
 * Structured error handling for Replicate prediction failures.
 *
 * Replicate embeds error codes in the format E#### inside prediction.error strings.
 * User-facing codes are those caused by user input (file size, invalid params, OOM from large input).
 * All other codes are tech/infrastructure errors that should trigger a tech alert.
 */

/** Codes that indicate a user-correctable problem. */
const USER_FACING_CODES = new Set(["E1001", "E9243", "E9825"]);

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
  // Replicate uses E#### (4-digit) codes, but some model errors use shorter codes like E006.
  const codeMatch = errorStr.match(/\bE\d{3,4}\b/);
  const code = codeMatch ? codeMatch[0] : "E1000";
  return new ReplicatePredictionError(code, `Replicate prediction ${status}: ${errorStr}`);
}

export function isReplicateUserFacingError(err: unknown): err is ReplicatePredictionError {
  return err instanceof ReplicatePredictionError && USER_FACING_CODES.has(err.code);
}

export function getReplicateUserMessage(
  err: ReplicatePredictionError,
  t: { errors: Record<string, string> },
): string {
  const e = t.errors;
  switch (err.code) {
    case "E1001":
      return e.replicateOom;
    case "E9243":
      return e.replicateInvalidParams;
    case "E9825":
      return e.replicateFileTooLarge;
    default:
      return e.generationFailed;
  }
}
