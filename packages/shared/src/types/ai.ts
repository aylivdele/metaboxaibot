import type { Section } from "./user.js";
import type { ContextStrategy } from "./dialog.js";

// ── Model settings types ──────────────────────────────────────────────────────

export type ModelSettingType =
  | "select"
  | "slider"
  | "toggle"
  | "text"
  | "number"
  | "voice-picker"
  | "did-voice-picker"
  | "color"
  | "avatar-picker"
  | "motion-picker";

export interface ModelSettingOption {
  value: string | number | boolean;
  label: string;
}

/**
 * Describes a single configurable parameter for a model.
 * The frontend renders the appropriate control based on `type`.
 */
export interface ModelSettingDef {
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Plain-language explanation of what this setting does (shown as hint below the control). */
  description?: string;
  type: ModelSettingType;
  /** Options list — required for "select" type. */
  options?: ModelSettingOption[];
  /** Min value — for "slider" and "number" types. */
  min?: number;
  /** Max value — for "slider" and "number" types. */
  max?: number;
  /** Step — for "slider" type. */
  step?: number;
  /** Default value shown when the user has not saved a preference. null = empty/unset. */
  default: string | number | boolean | null;
}

/** One specific model variant that belongs to a family (e.g. recraft-v4-pro). */
export interface ModelFamilyMember {
  modelId: string;
  /** Display label for the version dimension, e.g. "v3", "v4", "2". */
  versionLabel?: string;
  /** Display label for the variant dimension, e.g. "Standard", "Pro", "Vector". */
  variantLabel?: string;
  /** Replaces the base family description for this specific model variant. */
  descriptionOverride?: string;
}

/**
 * A family groups related model variants under one name shown in the bot menu.
 * Users pick the family in the bot; version/variant/settings are configured in the mini-app.
 */
export interface ModelFamily {
  id: string;
  name: string;
  /** Base description shown unless a member provides descriptionOverride. */
  description: string;
  section: Section;
  /** Model ID used when the family is first activated (no saved preference). */
  defaultModelId: string;
  members: ModelFamilyMember[];
}

export interface AIModel {
  id: string;
  name: string;
  /** Short model description shown to users (1–2 sentences). */
  description: string;
  section: Section;
  provider: string;
  /** If set, this model belongs to the named family (e.g. "recraft", "flux"). */
  familyId?: string;
  /** Version label within the family, e.g. "v3", "v4". */
  versionLabel?: string;
  /** Variant label within the family, e.g. "Standard", "Pro", "Vector". */
  variantLabel?: string;
  /** Replaces the family description in the Management UI for this specific variant. */
  descriptionOverride?: string;
  /**
   * Provider cost in USD per request (break-even cost).
   * For LLM models this is 0 — cost is driven entirely by per-token pricing below.
   * For media generation (image/audio/video) this is the mid-range provider price.
   */
  costUsdPerRequest: number;
  /**
   * USD per 1 million INPUT tokens (LLM models only, 0 for media).
   */
  inputCostUsdPerMToken: number;
  /**
   * USD per 1 million OUTPUT tokens (LLM models only, 0 for media).
   */
  outputCostUsdPerMToken: number;
  supportsImages: boolean;
  supportsVoice: boolean;
  supportsWeb: boolean; // выход в интернет
  isAsync: boolean; // требует очереди (для image/video/audio)
  contextStrategy: ContextStrategy;
  contextMaxMessages: number; // актуально для db_history: сколько сообщений отправлять
  /**
   * USD per megapixel for models with per-megapixel billing (e.g. FLUX).
   * When set, costUsdPerRequest must be 0; actual cost = ceil(px/1_000_000) × this rate.
   * The megapixels value is computed from the actual output image dimensions.
   */
  costUsdPerMPixel?: number;
  /**
   * USD per 1 million video tokens for models with per-video-token billing (e.g. Seedance).
   * When set, costUsdPerRequest must be 0.
   * videoTokens = (width × height × fps × duration) / 1024
   */
  costUsdPerMVideoToken?: number;
  /**
   * USD per second for models with per-duration billing (e.g. Kling, Pika, Sora, Veo, Runway, Wan).
   * When set, costUsdPerRequest must be 0; actual cost = durationSeconds × this rate.
   * Use costVariants to adjust the rate based on settings (quality, audio, resolution).
   * The base value must match the DEFAULT settings combination.
   *
   * For audio SFX (sounds-el): when costUsdPerSecond is set but durationSeconds is not passed
   * to calculateCost, the duration is automatically read from modelSettings.duration_seconds.
   * If duration_seconds is null/absent, costUsdPerRequest is used (AI-determines-duration mode).
   */
  costUsdPerSecond?: number;
  /**
   * USD per 1000 characters of input text, for character-based billing (TTS, voice clone).
   * When set, costUsdPerRequest must be 0; actual cost = charCount / 1000 × this rate.
   * Use costVariants to adjust the rate based on model setting (tts-1 vs tts-1-hd, etc.).
   * The base value must match the DEFAULT model setting.
   */
  costUsdPerKChar?: number;
  /** FPS assumed for video token billing. Required when costUsdPerMVideoToken is set. */
  videoFps?: number;
  /**
   * Supported aspect ratios for image/video generation models.
   * null = model does not support aspect ratio customization.
   * Ratios are in "W:H" string format, e.g. "16:9", "1:1", "9:16".
   */
  supportedAspectRatios?: string[] | null;
  /**
   * Supported clip durations in seconds for video generation models.
   * null = model does not support duration selection (fixed).
   * Use supportedDurations for discrete presets, durationRange for continuous slider.
   */
  supportedDurations?: number[] | null;
  /**
   * Continuous duration range for models that accept any integer value between min and max.
   * When set, a slider is shown instead of preset buttons.
   */
  durationRange?: { min: number; max: number } | null;
  /**
   * When the cost depends on a user-chosen setting value, maps each possible value to a cost
   * override applied at billing time.
   *
   * For media models (fixed per-request cost, e.g. "quality", "mode"):
   *   map values are plain numbers → override costUsdPerRequest.
   *   Example: { settingKey: "quality", map: { low: 0.009, medium: 0.034, high: 0.133 } }
   *
   * For LLM models (per-token cost, e.g. "enable_thinking" on Qwen):
   *   map values are { outputCostUsdPerMToken? } → override the per-token price.
   *   Example: { settingKey: "enable_thinking", map: { "true": { outputCostUsdPerMToken: 8.4 }, "false": { outputCostUsdPerMToken: 2.8 } } }
   *
   * The base costUsdPerRequest / outputCostUsdPerMToken should match the DEFAULT setting value.
   */
  costVariants?: {
    settingKey: string;
    map: Record<
      string,
      | number
      | {
          costUsdPerRequest?: number;
          outputCostUsdPerMToken?: number;
          /** Override per-second rate for per-duration billing models. */
          costUsdPerSecond?: number;
          /** Override per-video-token rate (e.g. Seedance audio toggle). */
          costUsdPerMVideoToken?: number;
          /** Override per-1K-characters rate (e.g. TTS model tier, ElevenLabs model). */
          costUsdPerKChar?: number;
        }
    >;
  };
  /**
   * Additive USD costs applied on top of the base/variant cost when a setting
   * has a specific value. Each entry defines one setting dimension.
   * Example: web search toggle adds $0.015, high thinking adds $0.002.
   * Map keys are String(settingValue); only matched keys add cost.
   */
  costAddons?: Array<{
    settingKey: string;
    map: Record<string, number>;
  }>;
  /**
   * Configurable generation parameters exposed in the Management mini-app.
   * The frontend renders controls dynamically based on these definitions.
   * User-chosen values are stored in UserState.modelSettings and passed to the adapter.
   */
  settings?: ModelSettingDef[];
}

/** Входные данные для LLM-чата (с учётом стратегии контекста) */
export interface ChatInput {
  prompt: string;
  imageUrl?: string;
  audioUrl?: string;
  // db_history: передаём историю из БД
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  // provider_chain: передаём ID предыдущего ответа (OpenAI Responses API)
  previousResponseId?: string;
  // provider_thread: передаём ID треда (OpenAI Assistants)
  threadId?: string;
  options?: Record<string, unknown>;
}

/** Результат LLM-чата */
export interface ChatOutput {
  text: string;
  tokensUsed: number;
  // Возвращаем для обновления Dialog
  newResponseId?: string; // provider_chain: сохранить как providerLastResponseId
  newThreadId?: string; // provider_thread: при первом вызове (создание Thread)
  newMessageId?: string; // provider_thread: id сообщения ассистента
}

/** Входные данные для async-генерации (image/video/audio) */
export interface GenerationInput {
  prompt: string;
  imageUrl?: string;
  options?: Record<string, unknown>;
}

/** Результат async-генерации */
export interface GenerationOutput {
  mediaUrl: string;
  tokensUsed: number;
}
