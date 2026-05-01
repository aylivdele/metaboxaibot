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
  // Prompt rejection (covers "contains IP", celebrity refs, etc.)
  "prompt not allowed",
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

export function getLumaUserMessage(
  err: LumaApiError,
  t: { errors: Record<string, string> },
): string {
  const lower = err.detail.toLowerCase();
  const e = t.errors;

  if (lower.includes("blacklisted words")) return e.lumaBlacklistedWords;
  if (lower.includes("frame moderation failed")) return e.lumaImageModeration;
  if (lower.includes("advanced prompt moderation failed")) return e.lumaPromptModeration;
  if (lower.includes("failed to read user input frames")) return e.lumaImageLoadError;
  if (lower.includes("contains ip")) return e.lumaIntellectualProperty;
  if (lower.includes("prompt not allowed")) return e.lumaPromptModeration;
  if (lower.includes("prompt is required")) return e.lumaPromptRequired;
  if (lower.includes("prompt is too short")) return e.lumaPromptTooShort;
  if (lower.includes("prompt is too long")) return e.lumaPromptTooLong;
  if (lower.includes("loop is not supported")) return e.lumaLoopUnsupported;
  if (lower.includes("no keyframes provided")) return e.lumaNoKeyframes;
  if (lower.includes("unknown request type")) return e.lumaUnknownRequestType;

  return e.lumaRejected;
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
