/**
 * Structured HeyGen error handling.
 *
 * HeyGen returns errors in two shapes:
 *  - HTTP error on submit:  { code: number, message: string }
 *  - Poll failure:          data.failure_code (string enum name), data.failure_message (string)
 */

export class HeyGenApiError extends Error {
  constructor(
    /** Numeric code from HeyGen (e.g. 400105) or -1 for poll failures without a numeric code. */
    public readonly code: number,
    /** Machine-readable enum name (e.g. "BLOCKED_WORDS_DETECTED"). */
    public readonly enumName: string,
    /** Human-readable message from HeyGen. */
    public readonly heygenMessage: string,
  ) {
    super(`HeyGen [${code}/${enumName}]: ${heygenMessage}`);
    this.name = "HeyGenApiError";
  }
}

// ── Error classification ───────────────────────────────────────────────────────

/**
 * Codes/enum names that are caused by the user's input and should not trigger
 * a tech alert. The user gets a localised message instead.
 */
const USER_FACING_CODES = new Set([
  // Moderation / content
  400105, // BLOCKED_WORDS_DETECTED
  400168, // INAPPROPRIATE_CONTENT
  400625, // CELEBRITY_CONTENT
  402007, // CHILD_SAFETY_MODERATION_FAILED
  402008, // CELEBRITY_MODERATION_FAILED
  402009, // INAPPROPRIATE_CONTENT_MODERATION_FAILED
  401003, // MODERATION_POLICY_VIOLATED
  400680, // UNSAFE_PROMPT
  // Face detection
  40004, // NO_FACE_ERROR
  40005, // TOO_MANY_FACES_ERROR
  40006, // BAD_QUALITY_IMAGE
  // Input validation
  40039, // INVALID_TEXT_INPUT
  40010, // VIDEO_FORMAT_NOT_SUPPORTED
  40044, // INVALID_AUDIO_FORMAT
  40002, // IMAGE_FORMAT_NOT_SUPPORTED
  400543, // ASSET_FORMAT_NOT_SUPPORTED
  400111, // INVALID_FILE_TYPE
  // Duration limits
  400165, // MOVIO_VIDEO_TOO_SHORT
  400150, // MOVIO_VIDEO_IS_TOO_LONG
  400128, // MOVIO_PHOTAR_DURATION_TOO_LONG
  1000022, // AUDIO_DURATION_TOO_LONG
  401035, // AUDIO_LENGTH_MISMATCH
  // Avatar / voice not found (user misconfigured)
  400144, // AVATAR_NOT_FOUND
  400174, // PHOTAR_NOT_FOUND
  40090, // INVALID_AVATAR_INFO
  400116, // VOICE_NOT_FOUND
  400548, // TTS_VOICE_UNAVAILABLE_ERR
  400552, // TTS_CUSTOMER_VOICE_ERR
  400551, // TTS_PAID_VOICE_ERR
  400634, // TTS_LANGUAGE_ERROR
  // Usage limits visible to user
  400664, // TRIAL_VIDEO_LIMIT_EXCEEDED
  400685, // AVATAR_USAGE_NOT_PERMITTED
  400631, // USER_BLOCKED
  400599, // TIER_NOT_SUPPORT
]);

export function isHeyGenUserFacingError(err: unknown): err is HeyGenApiError {
  return err instanceof HeyGenApiError && USER_FACING_CODES.has(err.code);
}

/**
 * Provider-side errors that are NOT the user's fault but should still
 * notify the tech channel (e.g. our HeyGen account ran out of credits).
 * The user sees "model temporarily unavailable".
 */
const PROVIDER_UNAVAILABLE_ENUMS = new Set(["MOVIO_PAYMENT_INSUFFICIENT_CREDIT"]);

export function isHeyGenProviderUnavailable(err: unknown): err is HeyGenApiError {
  return err instanceof HeyGenApiError && PROVIDER_UNAVAILABLE_ENUMS.has(err.enumName);
}

export function getHeyGenUserMessage(
  err: HeyGenApiError,
  t: { errors: Record<string, string> },
): string {
  const e = t.errors;
  switch (err.code) {
    case 400105:
      return e.heygenBlockedWords;
    case 400168:
    case 402009:
      return e.heygenNsfw;
    case 400625:
    case 402008:
      return e.heygenCelebrity;
    case 402007:
      return e.heygenChildSafety;
    case 401003:
    case 400680:
      return e.heygenPolicyViolation;
    case 40004:
      return e.heygenNoFace;
    case 40005:
      return e.heygenMultipleFaces;
    case 40006:
      return e.heygenBadImageQuality;
    case 40039:
      return e.heygenInvalidText;
    case 40010:
      return e.heygenVideoFormat;
    case 40044:
      return e.heygenAudioFormat;
    case 40002:
    case 400543:
    case 400111:
      return e.heygenFileFormat;
    case 400165:
      return e.heygenVideoTooShort;
    case 400150:
    case 400128:
      return e.heygenFileTooLong;
    case 1000022:
      return e.heygenAudioTooLong;
    case 401035:
      return e.heygenAudioLengthMismatch;
    case 400144:
    case 400174:
    case 40090:
      return e.heygenAvatarNotFound;
    case 400116:
    case 400548:
    case 400552:
      return e.heygenVoiceNotFound;
    case 400551:
      return e.heygenVoicePremium;
    case 400634:
      return e.heygenTtsLanguage;
    case 400664:
      return e.heygenTrialLimit;
    case 400685:
      return e.heygenAvatarPermission;
    case 400631:
      return e.heygenUserBlocked;
    case 400599:
      return e.heygenTierRequired;
    default:
      return e.heygenRejected;
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a HeyGen JSON error body (from failed HTTP response).
 *
 * v1/v2 shape: { code: number, message: string }
 * v3 shape:    { error: { code: string, message: string } }
 */
export function parseHeyGenErrorBody(body: unknown): HeyGenApiError | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Legacy v1/v2: top-level { code: number, message: string }
  if (typeof b.code === "number" && typeof b.message === "string") {
    return new HeyGenApiError(b.code, String(b.code), b.message);
  }

  // v3: { error: { code: string, message: string } }
  if (b.error && typeof b.error === "object") {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === "string" && typeof e.message === "string") {
      // Map string enum name to numeric code if known, else -1
      const numericCode = ENUM_TO_CODE[e.code] ?? -1;
      return new HeyGenApiError(numericCode, e.code, e.message);
    }
    // Legacy nested { error: { code: number, message } }
    if (typeof e.code === "number" && typeof e.message === "string") {
      return new HeyGenApiError(e.code, String(e.code), e.message);
    }
  }

  return null;
}

/**
 * Parse a HeyGen poll failure into a structured error.
 * failure_code is an enum name string (e.g. "BLOCKED_WORDS_DETECTED"),
 * failure_message is a human-readable string.
 */
export function parseHeyGenPollFailure(
  failureCode: string | null | undefined,
  failureMessage: string | null | undefined,
): HeyGenApiError {
  const enumName = failureCode ?? "UNKNOWN_ERROR";
  const msg = failureMessage ?? "Video generation failed";

  // Map enum name back to numeric code for uniform classification
  const code = ENUM_TO_CODE[enumName] ?? -1;
  return new HeyGenApiError(code, enumName, msg);
}

/** Partial reverse-map from enum name → numeric code for poll failures. */
const ENUM_TO_CODE: Record<string, number> = {
  BLOCKED_WORDS_DETECTED: 400105,
  INAPPROPRIATE_CONTENT: 400168,
  CELEBRITY_CONTENT: 400625,
  CHILD_SAFETY_MODERATION_FAILED: 402007,
  CELEBRITY_MODERATION_FAILED: 402008,
  INAPPROPRIATE_CONTENT_MODERATION_FAILED: 402009,
  MODERATION_POLICY_VIOLATED: 401003,
  UNSAFE_PROMPT: 400680,
  NO_FACE_ERROR: 40004,
  TOO_MANY_FACES_ERROR: 40005,
  BAD_QUALITY_IMAGE: 40006,
  INVALID_TEXT_INPUT: 40039,
  VIDEO_FORMAT_NOT_SUPPORTED: 40010,
  INVALID_AUDIO_FORMAT: 40044,
  IMAGE_FORMAT_NOT_SUPPORTED: 40002,
  ASSET_FORMAT_NOT_SUPPORTED: 400543,
  INVALID_FILE_TYPE: 400111,
  MOVIO_VIDEO_TOO_SHORT: 400165,
  MOVIO_VIDEO_IS_TOO_LONG: 400150,
  MOVIO_PHOTAR_DURATION_TOO_LONG: 400128,
  AUDIO_DURATION_TOO_LONG: 1000022,
  AUDIO_LENGTH_MISMATCH: 401035,
  AVATAR_NOT_FOUND: 400144,
  PHOTAR_NOT_FOUND: 400174,
  INVALID_AVATAR_INFO: 40090,
  VOICE_NOT_FOUND: 400116,
  TTS_VOICE_UNAVAILABLE_ERR: 400548,
  TTS_CUSTOMER_VOICE_ERR: 400552,
  TTS_PAID_VOICE_ERR: 400551,
  TTS_LANGUAGE_ERROR: 400634,
  TRIAL_VIDEO_LIMIT_EXCEEDED: 400664,
  AVATAR_USAGE_NOT_PERMITTED: 400685,
  USER_BLOCKED: 400631,
  TIER_NOT_SUPPORT: 400599,
  MOVIO_PAYMENT_INSUFFICIENT_CREDIT: 900001,
};
