import type { Section } from "./user.js";
import type { ContextStrategy } from "./dialog.js";

export interface AIModel {
  id: string;
  name: string;
  /** Short model description shown to users (1–2 sentences). */
  description: string;
  section: Section;
  provider: string;
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
