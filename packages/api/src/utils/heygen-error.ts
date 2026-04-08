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

/** Returns a Russian user-facing message for a HeyGen user-facing error. */
export function getHeyGenUserMessage(err: HeyGenApiError): string {
  switch (err.code) {
    case 400105:
      return "❌ Запрос содержит запрещённые слова или запрещённый контент. Измените текст и попробуйте снова.";
    case 400168:
    case 402009:
      return "❌ Запрос отклонён: обнаружен контент NSFW. Измените запрос и попробуйте снова.";
    case 400625:
    case 402008:
      return "❌ Запрос отклонён: обнаружено лицо знаменитости. Использование таких изображений запрещено.";
    case 402007:
      return "❌ Запрос отклонён: обнаружен контент с несовершеннолетними. Использование таких материалов запрещено.";
    case 401003:
    case 400680:
      return "❌ Запрос нарушает политику допустимого использования. Измените запрос и попробуйте снова.";
    case 40004:
      return "❌ Лицо не обнаружено на изображении. Убедитесь, что на фото чётко видно лицо.";
    case 40005:
      return "❌ На изображении обнаружено несколько лиц. Используйте фото с одним лицом.";
    case 40006:
      return "❌ Качество изображения недостаточное. Загрузите более чёткое фото.";
    case 40039:
      return "❌ Текст содержит недопустимые символы или слишком длинный. Исправьте текст и попробуйте снова.";
    case 40010:
      return "❌ Формат видео не поддерживается. Используйте MP4 или MOV.";
    case 40044:
      return "❌ Формат аудио не поддерживается. Используйте MP3 или WAV.";
    case 40002:
    case 400543:
    case 400111:
      return "❌ Формат файла не поддерживается. Используйте JPEG или PNG.";
    case 400165:
      return "❌ Видео слишком короткое. Попробуйте другое видео.";
    case 400150:
    case 400128:
      return "❌ Видео или аудио слишком длинное. Используйте более короткий файл.";
    case 1000022:
      return "❌ Аудио слишком длинное. Используйте более короткий аудиофайл.";
    case 401035:
      return "❌ Длина аудио не совпадает с длиной видео. Проверьте входные файлы.";
    case 400144:
    case 400174:
    case 40090:
      return "❌ Аватар не найден. Выберите другой аватар в настройках.";
    case 400116:
    case 400548:
    case 400552:
      return "❌ Голос не найден. Выберите другой голос в настройках.";
    case 400551:
      return "❌ Выбранный голос доступен только для премиум-аккаунтов HeyGen.";
    case 400634:
      return "❌ Ошибка языка TTS. Проверьте настройки голоса.";
    case 400664:
      return "❌ Достигнут дневной лимит пробного периода HeyGen. Попробуйте завтра или обновите план.";
    case 400685:
      return "❌ Использование этого аватара не разрешено.";
    case 400631:
      return "❌ Аккаунт HeyGen заблокирован за нарушение правил сервиса.";
    case 400599:
      return "❌ Эта функция требует более высокого тарифного плана HeyGen.";
    default:
      return "❌ HeyGen отклонил запрос. Проверьте настройки и попробуйте снова.";
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a HeyGen JSON error body (from failed HTTP response).
 * Shape: { code: number, message: string } or { error: { code, message } }
 */
export function parseHeyGenErrorBody(body: unknown): HeyGenApiError | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Top-level { code, message }
  if (typeof b.code === "number" && typeof b.message === "string") {
    return new HeyGenApiError(b.code, String(b.code), b.message);
  }

  // Nested { error: { code, message } }
  if (b.error && typeof b.error === "object") {
    const e = b.error as Record<string, unknown>;
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
};
