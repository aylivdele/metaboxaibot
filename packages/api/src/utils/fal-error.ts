/**
 * Utilities for parsing structured error responses from fal.ai.
 *
 * Fal returns two error shapes:
 *  - Model errors:   err.body.detail = Array<{ type, msg, ctx?, loc?, input? }>
 *  - Request errors: err.body = { detail: string, error_type: string }
 */

export interface FalErrorDetail {
  type: string;
  msg: string;
  ctx?: Record<string, unknown>;
  loc?: string[];
  input?: unknown;
}

/** Error types that are caused by the user's input and should not be retried. */
const USER_FACING_TYPES = new Set([
  "content_policy_violation",
  "no_media_generated",
  "image_too_small",
  "image_too_large",
  "image_load_error",
  "file_download_error",
  "face_detection_error",
  "file_too_large",
  "greater_than",
  "greater_than_equal",
  "less_than",
  "less_than_equal",
  "multiple_of",
  "sequence_too_short",
  "sequence_too_long",
  "one_of",
  "feature_not_supported",
  "invalid_archive",
  "archive_file_count_below_minimum",
  "archive_file_count_exceeds_maximum",
  "audio_duration_too_long",
  "audio_duration_too_short",
  "unsupported_audio_format",
  "unsupported_image_format",
  "unsupported_video_format",
  "video_duration_too_long",
  "video_duration_too_short",
]);

/** Extract structured detail array from a fal client error, or null if not a fal model error. */
export function parseFalModelErrors(err: unknown): FalErrorDetail[] | null {
  if (err === null || typeof err !== "object") return null;
  const body = (err as Record<string, unknown>).body;
  if (!body || typeof body !== "object") return null;
  const detail = (body as Record<string, unknown>).detail;
  if (!Array.isArray(detail)) return null;
  return detail as FalErrorDetail[];
}

/** Returns true if any error in the detail array is user-facing (not retryable). */
export function hasFalUserFacingError(err: unknown): boolean {
  const details = parseFalModelErrors(err);
  if (!details) return false;
  return details.some((d) => USER_FACING_TYPES.has(d?.type));
}

/** Returns a localized user-facing message for the first user-facing fal error, or null. */
export function getFalUserMessage(
  err: unknown,
  t: { errors: Record<string, string> },
): string | null {
  const details = parseFalModelErrors(err);
  if (!details) return null;

  const userFacing = details.filter((d) => USER_FACING_TYPES.has(d?.type));
  if (!userFacing.length) return null;

  const messages = userFacing.map((d) => formatFalError(d, t));
  return messages.join("\n");
}

function sub(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "?");
}

function formatFalError(d: FalErrorDetail, t: { errors: Record<string, string> }): string {
  const ctx = d.ctx ?? {};
  const e = t.errors;

  switch (d.type) {
    case "content_policy_violation":
      return e.falContentPolicy;

    case "no_media_generated":
      return e.falNoMediaGenerated;

    case "image_too_small":
      return sub(e.falImageTooSmall, {
        width: String(ctx.min_width ?? "?"),
        height: String(ctx.min_height ?? "?"),
      });

    case "image_too_large":
      return sub(e.falImageTooLarge, {
        width: String(ctx.max_width ?? "?"),
        height: String(ctx.max_height ?? "?"),
      });

    case "image_load_error":
      return e.falImageLoadError;

    case "file_download_error":
      return e.falFileDownloadError;

    case "face_detection_error":
      return e.falFaceDetectionError;

    case "file_too_large": {
      const maxBytes = ctx.max_size as number | undefined;
      const maxMb = maxBytes != null ? (maxBytes / 1_048_576).toFixed(0) : null;
      return maxMb ? sub(e.falFileTooLargeLimit, { maxMb }) : e.falFileTooLarge;
    }

    case "audio_duration_too_long":
      return sub(e.falAudioTooLong, {
        got: String(ctx.provided_duration ?? "?"),
        max: String(ctx.max_duration ?? "?"),
      });

    case "audio_duration_too_short":
      return sub(e.falAudioTooShort, {
        got: String(ctx.provided_duration ?? "?"),
        min: String(ctx.min_duration ?? "?"),
      });

    case "video_duration_too_long":
      return sub(e.falVideoTooLong, {
        got: String(ctx.provided_duration ?? "?"),
        max: String(ctx.max_duration ?? "?"),
      });

    case "video_duration_too_short":
      return sub(e.falVideoTooShort, {
        got: String(ctx.provided_duration ?? "?"),
        min: String(ctx.min_duration ?? "?"),
      });

    case "unsupported_audio_format":
    case "unsupported_image_format":
    case "unsupported_video_format": {
      const formats = Array.isArray(ctx.supported_formats)
        ? (ctx.supported_formats as string[]).join(", ")
        : null;
      return formats ? sub(e.falUnsupportedFormatList, { formats }) : e.falUnsupportedFormat;
    }

    case "invalid_archive": {
      const exts = Array.isArray(ctx.supported_extensions)
        ? (ctx.supported_extensions as string[]).join(", ")
        : null;
      return exts ? sub(e.falInvalidArchiveExts, { exts }) : e.falInvalidArchive;
    }

    case "archive_file_count_below_minimum": {
      const min = String(ctx.min_count ?? "?");
      const got = String(ctx.provided_count ?? "?");
      const exts = Array.isArray(ctx.supported_extensions)
        ? (ctx.supported_extensions as string[]).join(", ")
        : null;
      return exts
        ? sub(e.falArchiveTooFewExts, { got, min, exts })
        : sub(e.falArchiveTooFew, { got, min });
    }

    case "archive_file_count_exceeds_maximum":
      return sub(e.falArchiveTooMany, {
        got: String(ctx.provided_count ?? "?"),
        max: String(ctx.max_count ?? "?"),
      });

    case "feature_not_supported":
      return e.falFeatureNotSupported;

    case "one_of": {
      const expected = Array.isArray(ctx.expected) ? (ctx.expected as string[]).join(", ") : null;
      const field = d.loc?.slice(1).join(".") ?? "";
      if (!expected) return `❌ ${d.msg}`;
      return field ? sub(e.falOneOfField, { field, expected }) : sub(e.falOneOf, { expected });
    }

    default:
      // Numeric validation errors (greater_than, less_than, etc.) — msg is descriptive enough
      return `❌ ${d.msg}`;
  }
}
