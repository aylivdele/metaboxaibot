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

/** Returns a Russian user-facing message for the first user-facing fal error, or null. */
export function getFalUserMessage(err: unknown): string | null {
  const details = parseFalModelErrors(err);
  if (!details) return null;

  const userFacing = details.filter((d) => USER_FACING_TYPES.has(d?.type));
  if (!userFacing.length) return null;

  const messages = userFacing.map((d) => formatFalError(d));
  return messages.join("\n");
}

function formatFalError(d: FalErrorDetail): string {
  const ctx = d.ctx ?? {};

  switch (d.type) {
    case "content_policy_violation":
      return "❌ Запрос отклонён из-за нарушения политики допустимого использования. Измените запрос и попробуйте снова.";

    case "no_media_generated":
      return "❌ Модель не смогла сгенерировать результат для данного запроса. Попробуйте изменить промпт.";

    case "image_too_small": {
      const w = ctx.min_width ?? "?";
      const h = ctx.min_height ?? "?";
      return `❌ Изображение слишком маленькое. Минимальный размер: ${w}×${h} пкс.`;
    }

    case "image_too_large": {
      const w = ctx.max_width ?? "?";
      const h = ctx.max_height ?? "?";
      return `❌ Изображение слишком большое. Максимальный размер: ${w}×${h} пкс.`;
    }

    case "image_load_error":
      return "❌ Не удалось загрузить изображение. Убедитесь, что файл не повреждён и имеет поддерживаемый формат.";

    case "file_download_error":
      return "❌ Не удалось загрузить файл по указанной ссылке. Убедитесь, что файл доступен публично.";

    case "face_detection_error":
      return "❌ Лицо не обнаружено на изображении. Убедитесь, что на фото чётко видно лицо.";

    case "file_too_large": {
      const maxBytes = ctx.max_size as number | undefined;
      const maxMb = maxBytes != null ? (maxBytes / 1_048_576).toFixed(0) : null;
      return maxMb
        ? `❌ Файл слишком большой. Максимальный размер: ${maxMb} МБ.`
        : "❌ Файл слишком большой.";
    }

    case "audio_duration_too_long": {
      const max = ctx.max_duration ?? "?";
      const got = ctx.provided_duration ?? "?";
      return `❌ Аудио слишком длинное (${got} сек). Максимальная длительность: ${max} сек.`;
    }

    case "audio_duration_too_short": {
      const min = ctx.min_duration ?? "?";
      const got = ctx.provided_duration ?? "?";
      return `❌ Аудио слишком короткое (${got} сек). Минимальная длительность: ${min} сек.`;
    }

    case "video_duration_too_long": {
      const max = ctx.max_duration ?? "?";
      const got = ctx.provided_duration ?? "?";
      return `❌ Видео слишком длинное (${got} сек). Максимальная длительность: ${max} сек.`;
    }

    case "video_duration_too_short": {
      const min = ctx.min_duration ?? "?";
      const got = ctx.provided_duration ?? "?";
      return `❌ Видео слишком короткое (${got} сек). Минимальная длительность: ${min} сек.`;
    }

    case "unsupported_audio_format":
    case "unsupported_image_format":
    case "unsupported_video_format": {
      const formats = Array.isArray(ctx.supported_formats)
        ? (ctx.supported_formats as string[]).join(", ")
        : null;
      return formats
        ? `❌ Неподдерживаемый формат файла. Поддерживаются: ${formats}.`
        : "❌ Неподдерживаемый формат файла.";
    }

    case "invalid_archive": {
      const exts = Array.isArray(ctx.supported_extensions)
        ? (ctx.supported_extensions as string[]).join(", ")
        : null;
      return exts
        ? `❌ Не удалось открыть архив. Поддерживаются: ${exts}.`
        : "❌ Не удалось открыть архив. Проверьте, что файл не повреждён.";
    }

    case "archive_file_count_below_minimum": {
      const min = ctx.min_count ?? "?";
      const got = ctx.provided_count ?? "?";
      const exts = Array.isArray(ctx.supported_extensions)
        ? (ctx.supported_extensions as string[]).join(", ")
        : "";
      return `❌ Недостаточно файлов в архиве (найдено ${got}, нужно минимум ${min}${exts ? `, форматы: ${exts}` : ""}).`;
    }

    case "archive_file_count_exceeds_maximum": {
      const max = ctx.max_count ?? "?";
      const got = ctx.provided_count ?? "?";
      return `❌ Слишком много файлов в архиве (найдено ${got}, максимум ${max}).`;
    }

    case "feature_not_supported":
      return "❌ Запрошенная функция не поддерживается данной моделью.";

    case "one_of": {
      const expected = Array.isArray(ctx.expected) ? (ctx.expected as string[]).join(", ") : null;
      const field = d.loc?.slice(1).join(".") ?? "";
      return expected
        ? `❌ Недопустимое значение${field ? ` для поля «${field}»` : ""}. Допустимые значения: ${expected}.`
        : `❌ ${d.msg}`;
    }

    default:
      // For numeric validation errors (greater_than, less_than etc.) the msg is descriptive enough
      return `❌ ${d.msg}`;
  }
}
