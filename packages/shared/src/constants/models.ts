import type { AIModel, ModelSettingDef } from "../types/ai.js";

// ── Helper builders ───────────────────────────────────────────────────────────

/** Creates an aspect_ratio select setting from an ordered list of ratio strings. */
function mkAspectRatio(ratios: string[], labelMap?: Record<string, string>): ModelSettingDef {
  return {
    key: "aspect_ratio",
    label: "Соотношение сторон",
    description: "Форма итогового изображения: горизонталь, вертикаль или квадрат.",
    type: "select",
    options: ratios.map((r) => ({ value: r, label: labelMap?.[r] ?? r })),
    default: ratios[0],
  };
}

/** Creates a duration select setting from a list of discrete second values. */
function mkDurationSelect(durations: number[]): ModelSettingDef {
  return {
    key: "duration",
    label: "Длительность",
    description: "Продолжительность видеоклипа в секундах.",
    type: "select",
    options: durations.map((d) => ({ value: d, label: `${d} с` })),
    default: durations[0],
  };
}

/** Creates a duration slider setting for a continuous range. */
function mkDurationSlider(min: number, max: number): ModelSettingDef {
  return {
    key: "duration",
    label: "Длительность (с)",
    description: `Продолжительность видеоклипа: от ${min} до ${max} секунд.`,
    type: "slider",
    min,
    max,
    step: 1,
    default: min,
  };
}

// ── Reusable setting blocks ───────────────────────────────────────────────────

/** Standard LLM controls: temperature, max output tokens, system prompt. */
const LLM_SETTINGS: ModelSettingDef[] = [
  {
    key: "temperature",
    label: "Температура",
    description:
      "Степень случайности ответов: ниже — точнее и предсказуемее, выше — разнообразнее и творчески.",
    type: "slider",
    min: 0,
    max: 2,
    step: 0.05,
    default: 1.0,
  },
  {
    key: "max_tokens",
    label: "Макс. длина ответа",
    description:
      "Максимальное количество слов, которые ИИ может написать за один ответ. Увеличьте для длинных текстов.",
    type: "slider",
    min: 256,
    max: 8192,
    step: 256,
    default: 2048,
  },
  {
    key: "system_prompt",
    label: "Системный промпт",
    description:
      "Скрытая инструкция, которую ИИ всегда соблюдает: задайте роль, стиль или ограничения для всего диалога.",
    type: "text",
    default: "",
  },
];

/** Extra setting for Perplexity search models. */
const PERPLEXITY_EXTRA: ModelSettingDef = {
  key: "search_recency_filter",
  label: "Период поиска",
  description:
    "Ограничьте поиск свежими материалами: только за последний час, день, неделю или месяц.",
  type: "select",
  options: [
    { value: "month", label: "Месяц" },
    { value: "week", label: "Неделя" },
    { value: "day", label: "День" },
    { value: "hour", label: "Час" },
  ],
  default: "month",
};

/** Depth of search for Perplexity models. */
const PERPLEXITY_SEARCH_CONTEXT: ModelSettingDef = {
  key: "search_context_size",
  label: "Глубина поиска",
  description: "low — быстрее и дешевле, high — больше источников и точнее, но дороже.",
  type: "select",
  options: [
    { value: "low", label: "Низкая" },
    { value: "medium", label: "Средняя" },
    { value: "high", label: "Высокая" },
  ],
  default: "medium",
};

/** Domain filter for Perplexity models. */
const PERPLEXITY_DOMAIN_FILTER: ModelSettingDef = {
  key: "search_domain_filter",
  label: "Фильтр сайтов",
  description:
    "Ограничить поиск конкретными доменами (через запятую, напр. wikipedia.org, bbc.com). Пусто — без ограничений.",
  type: "text",
  default: "",
};

/** Reasoning effort for OpenAI o-series and Grok reasoning models. */
const REASONING_EFFORT: ModelSettingDef = {
  key: "reasoning_effort",
  label: "Глубина рассуждений",
  description:
    "Сколько усилий модель тратит на обдумывание: low — быстро, high — тщательнее и точнее, но дольше.",
  type: "select",
  options: [
    { value: "low", label: "Низкая" },
    { value: "medium", label: "Средняя" },
    { value: "high", label: "Высокая" },
  ],
  default: "medium",
};

/** Extended thinking toggle for Anthropic models. */
const EXTENDED_THINKING: ModelSettingDef = {
  key: "extended_thinking",
  label: "Расширенное мышление",
  description:
    "Модель думает дольше перед ответом — точнее для сложных задач, но медленнее. Доступно на Opus и Sonnet.",
  type: "toggle",
  default: false,
};

/** Thinking mode toggle for Qwen reasoning models. */
const ENABLE_THINKING: ModelSettingDef = {
  key: "enable_thinking",
  label: "Режим размышления",
  description:
    "Модель рассуждает перед ответом — точнее для сложных задач, но исходящих токенов больше.",
  type: "toggle",
  default: true,
};

/** Thinking budget slider for Gemini models. */
const THINKING_BUDGET: ModelSettingDef = {
  key: "thinking_budget",
  label: "Бюджет рассуждений",
  description: "Сколько токенов модель может потратить на внутренние рассуждения (0 = выключено).",
  type: "slider",
  min: 0,
  max: 24576,
  step: 256,
  default: 0,
};

/** Reasoning effort for Grok 3 Mini — only supports low/high (no medium). */
const GROK_MINI_REASONING: ModelSettingDef = {
  key: "reasoning_effort",
  label: "Режим рассуждений",
  description: "low — быстро и дёшево, high — точнее для сложных задач.",
  type: "select",
  options: [
    { value: "low", label: "Низкая" },
    { value: "high", label: "Высокая" },
  ],
  default: "low",
};

/** Seed for reproducible results in OpenAI chat models. */
const SEED_SETTING: ModelSettingDef = {
  key: "seed",
  label: "Seed",
  description: "Число для воспроизводимых результатов. Пусто — случайно каждый раз.",
  type: "number",
  min: 0,
  max: 2147483647,
  default: null,
};

/** FLUX / FLUX Pro generation controls. */
const FLUX_SETTINGS: ModelSettingDef[] = [
  {
    key: "num_inference_steps",
    label: "Шаги генерации",
    description:
      "Количество итераций обработки: больше шагов — детальнее и качественнее, но медленнее.",
    type: "slider",
    min: 1,
    max: 50,
    step: 1,
    default: 28,
  },
  {
    key: "guidance_scale",
    label: "Следование промпту (CFG)",
    description:
      "Насколько строго ИИ следует вашему тексту: высокие значения — буквально, низкие — с творческой интерпретацией.",
    type: "slider",
    min: 1,
    max: 20,
    step: 0.5,
    default: 3.5,
  },
  {
    key: "seed",
    label: "Seed",
    description:
      "Число для воспроизведения результата: укажите одно и то же значение, чтобы получить похожий результат снова. Пусто — случайный результат каждый раз.",
    type: "number",
    min: 0,
    max: 2147483647,
    default: null,
  },
  {
    key: "output_format",
    label: "Формат файла",
    description: "JPEG — компактный файл, PNG — без потери качества и с поддержкой прозрачности.",
    type: "select",
    options: [
      { value: "jpeg", label: "JPEG" },
      { value: "png", label: "PNG" },
    ],
    default: "jpeg",
  },
];

/** Seedream guidance + seed. */
const SEEDREAM_SETTINGS: ModelSettingDef[] = [
  {
    key: "guidance_scale",
    label: "Следование промпту (CFG)",
    description:
      "Насколько строго ИИ следует вашему тексту: высокие значения — буквально, низкие — с творческой интерпретацией.",
    type: "slider",
    min: 1,
    max: 10,
    step: 0.5,
    default: 2.5,
  },
  {
    key: "seed",
    label: "Seed",
    description: "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
    type: "number",
    min: 0,
    max: 2147483647,
    default: null,
  },
];

/** Kling / Kling Pro video settings. */
const KLING_SETTINGS: ModelSettingDef[] = [
  mkAspectRatio(["16:9", "9:16", "1:1"]),
  mkDurationSelect([5, 10]),
  {
    key: "cfg_scale",
    label: "Следование промпту (CFG)",
    description:
      "Насколько точно видео передаёт ваше описание: ближе к 2 — строже по тексту, ближе к 0 — больше свободы.",
    type: "slider",
    min: 0,
    max: 2,
    step: 0.1,
    default: 0.5,
  },
  {
    key: "negative_prompt",
    label: "Негативный промпт",
    description: "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
    type: "text",
    default: "",
  },
  {
    key: "generate_audio",
    label: "Генерировать аудио",
    description: "Включить автоматическую генерацию звукового сопровождения к видео.",
    type: "toggle",
    default: true,
  },
];

export const AI_MODELS: Record<string, AIModel> = {
  // ── GPT / LLM ─────────────────────────────────────────────────────────────
  // LLM models have costUsdPerRequest = 0; cost is entirely token-driven.
  // Per-token prices sourced from provider pricing pages (2026-03-17).
  // Order matches the mini-app display order.

  // ── GPT 5 ─────────────────────────────────────────────────────────────────
  "gpt-5.4-pro": {
    id: "gpt-5.4-pro",
    name: "GPT 5.4 Pro",
    description: "Самая мощная модель OpenAI, максимальная точность и глубина рассуждений.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 30, // >272k tokens: ×2 = $60/M
    outputCostUsdPerMToken: 180, // >272k tokens: ×1.5 = $270/M
    contextPricingTiers: { thresholdTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 },
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  "gpt-5.4": {
    id: "gpt-5.4",
    name: "GPT 5.4",
    description: "Флагман OpenAI, отличный баланс интеллекта и скорости.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 2.5, // >272k tokens: ×2 = $5/M
    outputCostUsdPerMToken: 15, // >272k tokens: ×1.5 = $22.5/M
    contextPricingTiers: { thresholdTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 },
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  "gpt-5-pro": {
    id: "gpt-5-pro",
    name: "GPT 5 Pro",
    description: "Предыдущий флагман OpenAI, хороший баланс интеллекта и скорости.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 15.0,
    outputCostUsdPerMToken: 120.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  "gpt-5-mini": {
    id: "gpt-5-mini",
    name: "GPT 5 Mini",
    description: "Компактная и быстрая, хороша для повседневных задач.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.25,
    outputCostUsdPerMToken: 2.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  "gpt-5-nano": {
    id: "gpt-5-nano",
    name: "GPT 5 Nano",
    description: "Самая лёгкая и дешёвая в линейке GPT 5, мгновенные ответы.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.05,
    outputCostUsdPerMToken: 0.4,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  "o4-mini": {
    id: "o4-mini",
    name: "GPT-o4 Mini",
    description: "Reasoning-модель OpenAI, цепочка рассуждений для сложных задач за низкую цену.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 1.1,
    outputCostUsdPerMToken: 4.4,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  o3: {
    id: "o3",
    name: "GPT-o3",
    description: "Мощная reasoning-модель OpenAI, глубокие рассуждения для самых сложных задач.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 2.0,
    outputCostUsdPerMToken: 8.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  "o3-mini": {
    id: "o3-mini",
    name: "GPT-o3 Mini",
    description: "Компактная reasoning-модель OpenAI, отличное соотношение цена/точность.",
    section: "gpt",
    provider: "openai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 1.1,
    outputCostUsdPerMToken: 4.4,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "provider_chain",
    contextMaxMessages: 0,
  },
  // ── Anthropic ─────────────────────────────────────────────────────────────
  "claude-opus": {
    id: "claude-opus",
    name: "Claude 4.6 Opus",
    description:
      "Самая умная модель Anthropic, лучшая для сложных аналитических и творческих задач. Понимает изображения.",
    section: "gpt",
    provider: "anthropic",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 5.0,
    outputCostUsdPerMToken: 25.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },
  "claude-opus-4-5": {
    id: "claude-opus-4-5",
    name: "Claude 4.5 Opus",
    description:
      "Предыдущий флагман Anthropic, глубокий анализ и длинные тексты. Понимает изображения.",
    section: "gpt",
    provider: "anthropic",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 5.0,
    outputCostUsdPerMToken: 25.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },
  "claude-sonnet": {
    id: "claude-sonnet",
    name: "Claude 4.6 Sonnet",
    description:
      "Быстрая и умная, лучший баланс цена/качество у Anthropic. Отлично справляется с кодом, текстами и анализом.",
    section: "gpt",
    provider: "anthropic",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 3.0,
    outputCostUsdPerMToken: 15.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history", // нет серверного контекста
    contextMaxMessages: 50,
  },
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    name: "Claude 4.5 Sonnet",
    description: "Надёжная рабочая лошадка Anthropic, отлично для кода и текстов.",
    section: "gpt",
    provider: "anthropic",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 3.0,
    outputCostUsdPerMToken: 15.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },
  "claude-haiku": {
    id: "claude-haiku",
    name: "Claude 4.5 Haiku",
    description: "Самая быстрая и дешёвая модель Anthropic, мгновенные ответы для простых задач.",
    section: "gpt",
    provider: "anthropic",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 1.0,
    outputCostUsdPerMToken: 5.0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },

  // ── Google Gemini ──────────────────────────────────────────────────────────
  "gemini-3-pro": {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    description:
      "Флагман Google, огромный контекст и мультимодальность. Поддерживает поиск в интернете.",
    section: "gpt",
    provider: "google",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 2.0, //	$2.00, prompts <= 200k tokens; $4.00, prompts > 200k tokens
    outputCostUsdPerMToken: 12.0, //$12.00, prompts <= 200k tokens; $18.00, prompts > 200k
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: true,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },
  "gemini-3.1-pro": {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    description:
      "Обновлённый Gemini 3 Pro с улучшенным следованием инструкциям. Поиск в интернете.",
    section: "gpt",
    provider: "google",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 2.0, //	$2.00, prompts <= 200k tokens; $4.00, prompts > 200k tokens
    outputCostUsdPerMToken: 12.0, //$12.00, prompts <= 200k tokens; $18.00, prompts > 200k
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: true,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },
  "gemini-2-flash": {
    id: "gemini-2-flash",
    name: "Gemini 2.5 Flash",
    description:
      "Быстрая и дешёвая модель Google с reasoning, отличное соотношение цена/качество. Поддерживает поиск в интернете.",
    section: "gpt",
    provider: "google",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.3,
    outputCostUsdPerMToken: 2.5,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: true,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },
  "gemini-2-flash-lite": {
    id: "gemini-2-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    description:
      "Самая лёгкая и дешёвая модель Google, идеальна для простых задач с минимальными затратами.",
    section: "gpt",
    provider: "google",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.1,
    outputCostUsdPerMToken: 0.4,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 50,
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  "deepseek-r1": {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    description:
      "Reasoning-модель из Китая, конкурент o1, сильна в математике и коде. Открытые веса.",
    section: "gpt",
    provider: "deepseek",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.28,
    outputCostUsdPerMToken: 0.42,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
  },
  "deepseek-v3": {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    description:
      "Быстрая модель, отличная для общих задач и генерации текста при очень низкой стоимости.",
    section: "gpt",
    provider: "deepseek",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.28,
    outputCostUsdPerMToken: 0.42,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
  },

  // ── xAI Grok ──────────────────────────────────────────────────────────────
  "grok-4": {
    id: "grok-4",
    name: "Grok 4",
    description: "Флагман xAI (Илон Маск), мощные рассуждения с доступом к данным X.",
    section: "gpt",
    provider: "xai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 2.0, // x2 if context > 200k
    outputCostUsdPerMToken: 6.0, // x2 if context > 200k
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
    contextPricingTiers: { thresholdTokens: 200_000, inputMultiplier: 2, outputMultiplier: 2 },
  },
  "grok-4-fast": {
    id: "grok-4-fast",
    name: "Grok 4-fast",
    description: "Ускоренная модель флагмана Grok 4 от xAI. Быстрые ответы с рассуждением.",
    section: "gpt",
    provider: "xai",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.2, // x2 if context > 128k
    outputCostUsdPerMToken: 0.5, // x2 if context > 128k
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
    contextPricingTiers: { thresholdTokens: 128_000, inputMultiplier: 2, outputMultiplier: 2 },
  },

  // ── Perplexity ────────────────────────────────────────────────────────────
  "perplexity-sonar-pro": {
    id: "perplexity-sonar-pro",
    name: "Perplexity Sonar Pro + Internet",
    description: "Мощный AI-поиск с глубокими ответами. Актуальные данные из интернета.",
    section: "gpt",
    provider: "perplexity",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 3.0,
    outputCostUsdPerMToken: 15.0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: true,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 20,
  },
  "perplexity-sonar-research": {
    id: "perplexity-sonar-research",
    name: "Perplexity Sonar Deep Research",
    description: "Автономный исследователь, анализирует десятки источников за один запрос.",
    section: "gpt",
    provider: "perplexity",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 2.0,
    outputCostUsdPerMToken: 8.0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: true,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 20,
  },
  "perplexity-sonar": {
    id: "perplexity-sonar",
    name: "Perplexity Sonar + Internet",
    description: "Быстрый AI-поиск с актуальными данными из интернета.",
    section: "gpt",
    provider: "perplexity",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 1.0,
    outputCostUsdPerMToken: 1.0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: true,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 20,
  },

  // ── Qwen 3 ───────────────────────────────────────────────────────────────
  "qwen-3-max-thinking": {
    id: "qwen-3-max-thinking",
    name: "Qwen 3 Max Thinking",
    description: "Крупнейшая reasoning-модель Alibaba, конкурент GPT и Claude.",
    section: "gpt",
    provider: "alibaba",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.7,
    outputCostUsdPerMToken: 8.4, // thinking on (default); off=$2.80
    costVariants: {
      settingKey: "enable_thinking",
      map: { true: { outputCostUsdPerMToken: 8.4 }, false: { outputCostUsdPerMToken: 2.8 } },
    },
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
  },
  "qwen-3-thinking": {
    id: "qwen-3-thinking",
    name: "Qwen 3 Thinking",
    description: "Reasoning-модель Alibaba среднего размера, сильна в коде и математике.",
    section: "gpt",
    provider: "alibaba",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.2,
    outputCostUsdPerMToken: 2.4, // thinking on (default); off=$0.80
    costVariants: {
      settingKey: "enable_thinking",
      map: { true: { outputCostUsdPerMToken: 2.4 }, false: { outputCostUsdPerMToken: 0.8 } },
    },
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
  },
  "qwen-3": {
    id: "qwen-3",
    name: "Qwen 3",
    description: "Быстрая модель Alibaba, отличная для мультиязычных задач.",
    section: "gpt",
    provider: "alibaba",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0.18,
    outputCostUsdPerMToken: 2.1, // thinking on (default); off=$0.70
    costVariants: {
      settingKey: "enable_thinking",
      map: { true: { outputCostUsdPerMToken: 2.1 }, false: { outputCostUsdPerMToken: 0.7 } },
    },
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 40,
  },

  // ── Дизайн ────────────────────────────────────────────────────────────────
  // Media models have no per-token pricing; cost is driven by costUsdPerRequest.
  // Values are mid-range provider prices used as break-even basis.
  "nano-banana-pro": {
    id: "nano-banana-pro",
    name: "🍌 Nano Banana PRO",
    description:
      "Генерирует реалистичные фото и позволяет менять детали прямо словами: «убери фон», «добавь шляпу», «сделай вечер».",
    section: "design",
    provider: "fal",
    familyId: "nano-banana",
    variantLabel: "Pro",
    costVariants: { settingKey: "resolution", map: { "1K": 0.15, "2K": 0.15, "4K": 0.3 } },
    costUsdPerRequest: 0.15,
    costAddons: [{ settingKey: "enable_web_search", map: { true: 0.015 } }],
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: [
      "21:9",
      "16:9",
      "3:2",
      "4:3",
      "5:4",
      "1:1",
      "4:5",
      "3:4",
      "2:3",
      "9:16",
    ],
    settings: [
      mkAspectRatio(["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"]),
      {
        key: "safety_tolerance",
        label: "Допустимый контент",
        description: "1 — строгая фильтрация, 6 — минимальная. По умолчанию 4.",
        type: "slider",
        min: 1,
        max: 6,
        step: 1,
        default: 4,
      },
      {
        key: "resolution",
        label: "Разрешение",
        description:
          "Детализация итогового изображения: 1K — стандарт, 4K — максимальные детали. Влияет на цену.",
        type: "select",
        options: [
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
          { value: "4K", label: "4K" },
        ],
        default: "1K",
      },
      {
        key: "output_format",
        label: "Формат файла",
        description:
          "PNG — без потери качества, JPEG — компактнее, WebP — баланс качества и размера.",
        type: "select",
        options: [
          { value: "png", label: "PNG" },
          { value: "jpeg", label: "JPEG" },
          { value: "webp", label: "WebP" },
        ],
        default: "png",
      },
      {
        key: "enable_web_search",
        label: "Поиск в интернете",
        description:
          "Разрешить модели обращаться к интернету для уточнения деталей промпта. Влияет на цену.",
        type: "toggle",
        default: false,
      },
    ],
  },

  "nano-banana-2": {
    id: "nano-banana-2",
    name: "🍌 Nano Banana 2",
    description:
      "Генерирует реалистичные фото и редактирует их по текстовым командам. Поддерживает поиск в интернете и усиленное мышление для точного следования промпту.",
    section: "design",
    provider: "fal",
    familyId: "nano-banana",
    variantLabel: "Standard",
    // 0.5K = ×0.75, 1K = base $0.08, 2K = ×1.5, 4K = ×2
    costVariants: {
      settingKey: "resolution",
      map: { "0.5K": 0.06, "1K": 0.08, "2K": 0.12, "4K": 0.16 },
    },
    costUsdPerRequest: 0.08,
    costAddons: [
      { settingKey: "enable_web_search", map: { true: 0.015 } },
      { settingKey: "thinking_level", map: { high: 0.002 } },
    ],
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: [
      "21:9",
      "16:9",
      "3:2",
      "4:3",
      "5:4",
      "1:1",
      "4:5",
      "3:4",
      "2:3",
      "9:16",
    ],
    settings: [
      mkAspectRatio(["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"]),
      {
        key: "safety_tolerance",
        label: "Допустимый контент",
        description: "1 — строгая фильтрация, 6 — минимальная. По умолчанию 4.",
        type: "slider",
        min: 1,
        max: 6,
        step: 1,
        default: 4,
      },
      {
        key: "resolution",
        label: "Разрешение",
        description:
          "Детализация итогового изображения: 0.5K — быстро, 1K — стандарт, 4K — максимальные детали. Влияет на цену.",
        type: "select",
        options: [
          { value: "0.5K", label: "0.5K" },
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
          { value: "4K", label: "4K" },
        ],
        default: "1K",
      },
      {
        key: "output_format",
        label: "Формат файла",
        description:
          "PNG — без потери качества, JPEG — компактнее, WebP — баланс качества и размера.",
        type: "select",
        options: [
          { value: "png", label: "PNG" },
          { value: "jpeg", label: "JPEG" },
          { value: "webp", label: "WebP" },
        ],
        default: "png",
      },
      {
        key: "enable_web_search",
        label: "Поиск в интернете",
        description:
          "Разрешить модели обращаться к интернету для уточнения деталей промпта. Влияет на цену.",
        type: "toggle",
        default: false,
      },
      {
        key: "thinking_level",
        label: "Уровень мышления",
        description:
          "Minimal — лёгкое усиление следования инструкциям, High — глубокий анализ промпта. Отключить — без дополнительного мышления. Влияет на цену.",
        type: "select",
        options: [
          { value: "", label: "Отключено" },
          { value: "minimal", label: "Minimal" },
          { value: "high", label: "High" },
        ],
        default: "",
      },
    ],
  },
  midjourney: {
    id: "midjourney",
    name: "🎨 MidJourney v7",
    description:
      "Создаёт самые красивые и стильные изображения. Лучший выбор для арта, иллюстраций и эффектных визуалов.",
    section: "design",
    provider: "midjourney",
    costUsdPerRequest: 0.089,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"])],
  },
  "gpt-image-1.5": {
    id: "gpt-image-1.5",
    name: "🖼️ GPT Image 1.5",
    description:
      "Лучше всех понимает сложные текстовые запросы. Точно рисует то, что вы описали, включая текст на картинках.",
    section: "design",
    provider: "fal",
    costUsdPerRequest: 0.034, // default: medium quality 1024×1024; low=$0.009, high=$0.133
    costVariants: { settingKey: "quality", map: { low: 0.009, medium: 0.034, high: 0.133 } },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "16:9", "9:16"]),
      {
        key: "quality",
        label: "Качество",
        description:
          "low — очень быстро и дёшево, medium — баланс, high — максимальная детализация. Влияет на цену.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        default: "medium",
      },
    ],
  },
  "stable-diffusion": {
    id: "stable-diffusion",
    name: "🌊 Stable Diffusion 3.5",
    description:
      "Генерирует детальные изображения в любом стиле: от фотореализма до аниме и фэнтези. Отличается гибкостью.",
    section: "design",
    provider: "replicate",
    costUsdPerRequest: 0.0045,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    // Replicate/SDXL accepts arbitrary dimensions — offer extended set
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    settings: [
      mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]),
      {
        key: "negative_prompt",
        label: "Негативный промпт",
        description:
          "Что НЕ должно быть на картинке: перечислите нежелательные объекты, стили или черты.",
        type: "text",
        default: "",
      },
      {
        key: "guidance_scale",
        label: "Следование промпту (CFG)",
        description:
          "Насколько строго ИИ следует вашему тексту: высокие значения — буквально, низкие — с творческой интерпретацией.",
        type: "slider",
        min: 1,
        max: 20,
        step: 0.5,
        default: 7,
      },
      {
        key: "num_inference_steps",
        label: "Шаги генерации",
        description:
          "Количество итераций обработки: больше шагов — детальнее и качественнее, но медленнее.",
        type: "slider",
        min: 10,
        max: 50,
        step: 1,
        default: 30,
      },
    ],
  },
  "dall-e-3": {
    id: "dall-e-3",
    name: "🎯 DALL-E 3 Turbo",
    description:
      "Простой и понятный генератор от OpenAI. Хорошо понимает запросы на любом языке, отлично для быстрых идей.",
    section: "design",
    provider: "openai",
    costUsdPerRequest: 0.04,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    // DALL-E 3 only supports exactly 3 sizes
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "16:9", "9:16"]),
      {
        key: "quality",
        label: "Качество",
        description: "Standard — быстрее и дешевле, HD — более детальная и сложная картинка.",
        type: "select",
        options: [
          { value: "standard", label: "Standard" },
          { value: "hd", label: "HD" },
        ],
        default: "standard",
      },
      {
        key: "style",
        label: "Стиль",
        description:
          "Vivid — насыщенные цвета, яркий и выразительный результат. Natural — более спокойный и реалистичный.",
        type: "select",
        options: [
          { value: "vivid", label: "Vivid" },
          { value: "natural", label: "Natural" },
        ],
        default: "vivid",
      },
    ],
  },
  flux: {
    id: "flux",
    name: "⚡ FLUX.2",
    description:
      "Максимально реалистичные фото за секунды. Лучший выбор, когда нужно быстро и неотличимо от настоящего снимка.",
    section: "design",
    provider: "fal",
    familyId: "flux",
    versionLabel: "2",
    variantLabel: "Standard",
    costUsdPerRequest: 0,
    costUsdPerMPixel: 0.012, // $0.012/MP, billed as ceil(px/1_000_000)
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    // FAL image_size categories: square_hd, landscape_4_3, portrait_4_3, landscape_16_9, portrait_16_9
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]), ...FLUX_SETTINGS],
  },
  ideogram: {
    id: "ideogram",
    name: "✍️ Ideogram v3.0",
    description:
      "Лучше всех рисует читаемый текст на картинках. Идеален для логотипов, постеров, обложек и рекламы.",
    section: "design",
    provider: "ideogram",
    costUsdPerRequest: 0.06, // default: balanced tier; turbo=$0.03, quality=$0.09
    costVariants: {
      settingKey: "rendering_speed",
      map: { turbo: 0.03, balanced: 0.06, quality: 0.09 },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      {
        key: "style_type",
        label: "Стиль",
        description:
          "Художественное направление изображения: универсальный, фотореализм или дизайн.",
        type: "select",
        options: [
          { value: "AUTO", label: "Auto" },
          { value: "GENERAL", label: "General" },
          { value: "REALISTIC", label: "Realistic" },
          { value: "DESIGN", label: "Design" },
        ],
        default: "AUTO",
      },
      {
        key: "negative_prompt",
        label: "Негативный промпт",
        description: "Что НЕ должно быть на картинке: перечислите нежелательные объекты или стили.",
        type: "text",
        default: "",
      },
      {
        key: "rendering_speed",
        label: "Качество / скорость",
        description:
          "turbo — быстро и дёшево, balanced — баланс, quality — максимальное качество. Влияет на цену.",
        type: "select",
        options: [
          { value: "turbo", label: "Turbo" },
          { value: "balanced", label: "Balanced" },
          { value: "quality", label: "Quality" },
        ],
        default: "balanced",
      },
      {
        key: "magic_prompt_option",
        label: "Magic Prompt",
        description:
          "Автоматически улучшает ваш запрос для более красивого и детального результата.",
        type: "select",
        options: [
          { value: "AUTO", label: "Auto" },
          { value: "ON", label: "On" },
          { value: "OFF", label: "Off" },
        ],
        default: "AUTO",
      },
    ],
  },
  "imagen-4": {
    id: "imagen-4",
    name: "🔮 Imagen 4",
    description:
      "Новая модель генерации изображений от Google. Высокая фотореалистичность и точное следование текстовым описаниям.",
    section: "design",
    provider: "google",
    costUsdPerRequest: 0.04, // default: standard tier; fast=$0.02, ultra=$0.06
    costVariants: { settingKey: "mode", map: { fast: 0.02, standard: 0.04, ultra: 0.06 } },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      {
        key: "mode",
        label: "Качество / скорость",
        description:
          "fast — быстро и дёшево, standard — стандарт, ultra — максимальное разрешение до 2.8K. Влияет на цену.",
        type: "select",
        options: [
          { value: "fast", label: "Fast" },
          { value: "standard", label: "Standard" },
          { value: "ultra", label: "Ultra" },
        ],
        default: "standard",
      },
    ],
  },
  "flux-pro": {
    id: "flux-pro",
    name: "⚡ FLUX.2 Pro",
    description:
      "Профессиональная версия FLUX.2 — максимальное качество, точнее следует промпту, поддерживает редактирование загруженных изображений.",
    section: "design",
    provider: "fal",
    familyId: "flux",
    versionLabel: "2",
    variantLabel: "Pro",
    costUsdPerRequest: 0,
    costUsdPerMPixel: 0.03, // $0.030/MP, billed as ceil(px/1_000_000)
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]), ...FLUX_SETTINGS],
  },
  "recraft-v3": {
    id: "recraft-v3",
    name: "🖌️ Recraft v3",
    description:
      "Быстро создаёт иллюстрации, иконки и графику в едином стиле. Отлично подходит для дизайна и презентаций.",
    section: "design",
    provider: "recraft",
    familyId: "recraft",
    versionLabel: "v3",
    variantLabel: "Standard",
    costUsdPerRequest: 0.04,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      {
        key: "style",
        label: "Стиль",
        description:
          "Художественное направление: реалистичные фото, цифровые иллюстрации или векторная графика.",
        type: "select",
        options: [
          { value: "realistic_image", label: "Реализм" },
          { value: "digital_illustration", label: "Иллюстрация" },
          { value: "vector_illustration", label: "Вектор" },
        ],
        default: "realistic_image",
      },
      {
        key: "substyle",
        label: "Под-стиль",
        description:
          "Уточняет художественный стиль: b_and_w, hard_flash, pixel_art, grain и другие. Зависит от выбранного стиля.",
        type: "text",
        default: "",
      },
      {
        key: "no_text",
        label: "Без текста",
        description: "Запретить модели добавлять текст, надписи и леттеринг в изображение.",
        type: "toggle",
        default: false,
      },
      {
        key: "artistic_level",
        label: "Художественность",
        description: "0 — близко к реальности, 5 — максимально стилизованно и художественно.",
        type: "slider",
        min: 0,
        max: 5,
        step: 1,
        default: 2,
      },
    ],
  },
  "recraft-v4": {
    id: "recraft-v4",
    name: "🖌️ Recraft V4",
    description:
      "Recraft V4 создан специально для дизайна и маркетинга: чистая композиция, точный рендеринг текста и профессиональная полировка. Результат готов для кампании, презентации или страницы продукта без пост-обработки.",
    section: "design",
    provider: "recraft",
    familyId: "recraft",
    versionLabel: "v4",
    variantLabel: "Standard",
    costUsdPerRequest: 0.04,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      {
        key: "no_text",
        label: "Без текста",
        description: "Запретить модели добавлять текст, надписи и леттеринг в изображение.",
        type: "toggle",
        default: false,
      },
      {
        key: "seed",
        label: "Seed",
        description:
          "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
        type: "number",
        min: 0,
        max: 2147483647,
        default: null,
      },
    ],
  },
  "recraft-v4-pro": {
    id: "recraft-v4-pro",
    name: "💠 Recraft V4 Pro",
    description:
      "Расширенная версия Recraft V4 с повышенным разрешением и детализацией. Идеальна для ответственных дизайн-проектов, где требуется максимальная визуальная точность — без правок, прямо в производство.",
    section: "design",
    provider: "recraft",
    familyId: "recraft",
    versionLabel: "v4",
    variantLabel: "Pro",
    costUsdPerRequest: 0.25,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      {
        key: "no_text",
        label: "Без текста",
        description: "Запретить модели добавлять текст, надписи и леттеринг в изображение.",
        type: "toggle",
        default: false,
      },
      {
        key: "seed",
        label: "Seed",
        description:
          "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
        type: "number",
        min: 0,
        max: 2147483647,
        default: null,
      },
    ],
  },
  "recraft-v4-vector": {
    id: "recraft-v4-vector",
    name: "📐 Recraft V4 Vector (SVG)",
    description:
      "Генерирует масштабируемые SVG-векторы — идеально для логотипов, иллюстраций и иконок. Результат масштабируется без потери качества до любого размера и готов к прямому использованию в вёрстке и полиграфии.",
    section: "design",
    provider: "recraft",
    familyId: "recraft",
    versionLabel: "v4",
    variantLabel: "Vector",
    costUsdPerRequest: 0.08,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      {
        key: "seed",
        label: "Seed",
        description:
          "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
        type: "number",
        min: 0,
        max: 2147483647,
        default: null,
      },
    ],
  },
  "recraft-v4-pro-vector": {
    id: "recraft-v4-pro-vector",
    name: "📐 Recraft V4 Pro Vector (SVG)",
    description:
      "Профессиональная векторная генерация с максимальным качеством SVG. Подходит для сложных иллюстраций, брендинга и любого дизайна, требующего безупречной масштабируемости и детализации.",
    section: "design",
    provider: "recraft",
    familyId: "recraft",
    versionLabel: "v4",
    variantLabel: "Pro Vector",
    costUsdPerRequest: 0.3,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [
      {
        key: "seed",
        label: "Seed",
        description:
          "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
        type: "number",
        min: 0,
        max: 2147483647,
        default: null,
      },
    ],
  },
  "seedream-5": {
    id: "seedream-5",
    name: "🛍️ Seedream 5.0 (ByteDance)",
    description:
      "Идеально для товарных фото, одежды и каталогов. Создаёт чистые, профессиональные изображения для продаж.",
    section: "design",
    provider: "fal",
    familyId: "seedream",
    versionLabel: "5.0",
    variantLabel: "Standard",
    costUsdPerRequest: 0.035,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]), ...SEEDREAM_SETTINGS],
  },
  "seedream-4.5": {
    id: "seedream-4.5",
    name: "🛍️ Seedream 4.5",
    description:
      "Предыдущая версия Seedream — чуть проще, но быстрее и дешевле. Подойдёт для массовой генерации товарных фото.",
    section: "design",
    provider: "fal",
    familyId: "seedream",
    versionLabel: "4.5",
    variantLabel: "Standard",
    costUsdPerRequest: 0.04,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    settings: [mkAspectRatio(["1:1", "4:3", "3:4", "16:9", "9:16"]), ...SEEDREAM_SETTINGS],
  },

  // ── Видео ─────────────────────────────────────────────────────────────────
  kling: {
    id: "kling",
    name: "Kling 3.0",
    description:
      "Генерирует самые длинные видео — до 2 минут сразу, со звуком. Лучше всех передаёт движения людей.",
    section: "video",
    provider: "fal",
    // $0.126/s with audio (default), $0.084/s without audio
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.126,
    costVariants: {
      settingKey: "generate_audio",
      map: { true: { costUsdPerSecond: 0.126 }, false: { costUsdPerSecond: 0.084 } },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [5, 10],
    settings: [...KLING_SETTINGS],
  },
  "kling-pro": {
    id: "kling-pro",
    name: "Kling 3.0 Pro",
    description:
      "Генерирует самые длинные видео — до 2 минут сразу, со звуком. Лучше всех передаёт движения людей.",
    section: "video",
    provider: "fal",
    // $0.168/s with audio (default), $0.112/s without audio
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.168,
    costVariants: {
      settingKey: "generate_audio",
      map: { true: { costUsdPerSecond: 0.168 }, false: { costUsdPerSecond: 0.112 } },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [5, 10],
    settings: [...KLING_SETTINGS],
  },
  veo: {
    id: "veo",
    name: "Veo 3",
    description:
      "Видео от Google в качестве 4K со звуком и голосами. Поддерживает вертикальный формат для Reels и Shorts.",
    section: "video",
    provider: "google",
    // $0.35/s (Veo 2, Gemini API)
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.35,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16"],
    durationRange: { min: 5, max: 8 },
    settings: [
      mkAspectRatio(["16:9", "9:16"]),
      mkDurationSlider(5, 8),
      {
        key: "negative_prompt",
        label: "Негативный промпт",
        description:
          "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
        type: "text",
        default: "",
      },
      {
        key: "seed",
        label: "Seed",
        description:
          "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
        type: "number",
        min: 0,
        max: 4294967295,
        default: null,
      },
    ],
  },
  sora: {
    id: "sora",
    name: "Sora 2 (OpenAI)",
    description:
      "Самое реалистичное видео от OpenAI. Объекты двигаются как в реальности, со звуком и правильной физикой.",
    section: "video",
    provider: "openai",
    // $0.10/s standard (default), $0.30/s pro
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.1,
    costVariants: {
      settingKey: "quality",
      map: { standard: { costUsdPerSecond: 0.1 }, pro: { costUsdPerSecond: 0.3 } },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [4, 8, 12],
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      mkDurationSelect([4, 8, 12]),
      {
        key: "quality",
        label: "Тир качества",
        description: "standard — 720p, pro — 720p с более высокой детализацией. Влияет на цену.",
        type: "select",
        options: [
          { value: "standard", label: "Standard" },
          { value: "pro", label: "Pro" },
        ],
        default: "standard",
      },
    ],
  },
  runway: {
    id: "runway",
    name: "Runway Gen-4.5",
    description:
      "Полный контроль над видео: указывайте, что и как должно двигаться, управляйте камерой. Выбор профессионалов.",
    section: "video",
    provider: "runway",
    // $0.12/s (Gen-4.5); 5s=$0.60, 8s=$0.96, 10s=$1.20
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.12,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1280:768", "768:1280", "1104:832", "832:1104", "960:960"],
    supportedDurations: [5, 8, 10],
    settings: [
      mkAspectRatio(["1280:768", "768:1280", "1104:832", "832:1104", "960:960"], {
        "1280:768": "Горизонталь 16:9",
        "768:1280": "Вертикаль 9:16",
        "1104:832": "Горизонталь 4:3",
        "832:1104": "Вертикаль 3:4",
        "960:960": "Квадрат 1:1",
      }),
      mkDurationSelect([5, 8, 10]),
      {
        key: "seed",
        label: "Seed",
        description:
          "Число для воспроизведения результата. Пусто — случайный результат каждый раз.",
        type: "number",
        min: 0,
        max: 4294967295,
        default: null,
      },
      {
        key: "camera_horizontal",
        label: "Движение камеры: лево/право",
        description:
          "Панорамирование камеры по горизонтали: отрицательные значения — влево, положительные — вправо.",
        type: "slider",
        min: -10,
        max: 10,
        step: 0.5,
        default: 0,
      },
      {
        key: "camera_vertical",
        label: "Движение камеры: вверх/вниз",
        description:
          "Панорамирование камеры по вертикали: отрицательные значения — вниз, положительные — вверх.",
        type: "slider",
        min: -10,
        max: 10,
        step: 0.5,
        default: 0,
      },
      {
        key: "camera_zoom",
        label: "Зум камеры",
        description:
          "Приближение или удаление камеры: положительные значения — наезд, отрицательные — отъезд.",
        type: "slider",
        min: -10,
        max: 10,
        step: 0.5,
        default: 0,
      },
    ],
  },
  seedance: {
    id: "seedance",
    name: "Seedance 1.5 Pro (ByteDance)",
    description:
      "Создаёт видео с выразительным и необычным движением. Хорош для креативных и стилизованных роликов.",
    section: "video",
    provider: "fal",
    // Per-video-token billing: $2.4/M tokens with audio (default), $1.2/M without audio.
    // tokens = (w × h × fps × duration) / 1024; 720p 5s ≈ $0.26 with audio
    costUsdPerRequest: 0,
    costUsdPerMVideoToken: 2.4,
    costVariants: {
      settingKey: "generate_audio",
      map: { true: { costUsdPerMVideoToken: 2.4 }, false: { costUsdPerMVideoToken: 1.2 } },
    },
    videoFps: 24,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: null,
    durationRange: { min: 4, max: 12 },
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      mkDurationSlider(4, 12),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "720p — более чёткое и детальное видео, 480p — быстрее генерируется.",
        type: "select",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
        default: "720p",
      },
      {
        key: "generate_audio",
        label: "Генерировать аудио",
        description: "Включить автоматическую генерацию звукового сопровождения к видео.",
        type: "toggle",
        default: true,
      },
    ],
  },
  luma: {
    id: "luma",
    name: "Luma: Ray3.14",
    description:
      "Быстро создаёт видео в кинематографическом качестве. Режим черновика позволяет пробовать идеи за секунды.",
    section: "video",
    provider: "luma",
    costUsdPerRequest: 0.079, // ~$0.033–$0.125/gen
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    supportedDurations: [5, 10],
    settings: [
      mkAspectRatio(["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"]),
      mkDurationSelect([5, 10]),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "540p — быстро и дёшево, 720p — стандарт, 1080p — Full HD (в 4× дороже 720p).",
        type: "select",
        options: [
          { value: "540p", label: "540p" },
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
        default: "720p",
      },
      {
        key: "loop",
        label: "Зациклить видео",
        description:
          "Последний кадр плавно переходит в первый — идеально для бесконечных анимаций.",
        type: "toggle",
        default: false,
      },
    ],
  },
  "luma-ray2": {
    id: "luma-ray2",
    name: "Luma: Ray2",
    description:
      "Предыдущая версия Luma — проще и дешевле. Хороший выбор для быстрых видео без лишних затрат.",
    section: "video",
    provider: "luma",
    costUsdPerRequest: 0.04,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
    supportedDurations: [5, 10],
    settings: [
      mkAspectRatio(["16:9", "9:16", "4:3", "3:4", "1:1"]),
      mkDurationSelect([5, 10]),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "540p — быстро и дёшево, 720p — стандарт, 1080p — Full HD (в 4× дороже 720p).",
        type: "select",
        options: [
          { value: "540p", label: "540p" },
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
        default: "720p",
      },
      {
        key: "loop",
        label: "Зациклить видео",
        description:
          "Последний кадр плавно переходит в первый — идеально для бесконечных анимаций.",
        type: "toggle",
        default: false,
      },
    ],
  },
  minimax: {
    id: "minimax",
    name: "MiniMax Video-01",
    description:
      "Китайская видеомодель с отличным качеством движения персонажей. Генерирует 6-секундные клипы с высокой плавностью.",
    section: "video",
    provider: "minimax",
    costUsdPerRequest: 0.25,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9"],
    supportedDurations: [6],
    settings: [
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "Качество выходного видео. 720P — стандартное HD.",
        type: "select",
        options: [{ value: "720P", label: "720p" }],
        default: "720P",
      },
    ],
  },
  pika: {
    id: "pika",
    name: "Pika 2.5",
    description:
      "Быстрые и дешёвые видео с крутыми спецэффектами: взрывы, плавление, сжатие. Идеально для TikTok и Reels.",
    section: "video",
    provider: "pika",
    // $0.09/s at 1080p (default), $0.04/s at 720p
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.09,
    costVariants: {
      settingKey: "resolution",
      map: { "720p": { costUsdPerSecond: 0.04 }, "1080p": { costUsdPerSecond: 0.09 } },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [5, 10],
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      mkDurationSelect([5, 10]),
      {
        key: "resolution",
        label: "Разрешение видео",
        description:
          "1080p — Full HD с высокой чёткостью, 720p — быстрее и дешевле. Влияет на цену.",
        type: "select",
        options: [
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
        default: "1080p",
      },
    ],
  },
  hailuo: {
    id: "hailuo",
    name: "Hailuo 2.3",
    description:
      "Новейшая видеомодель MiniMax с нативным разрешением 1080p, кинематографичным движением и поддержкой 10-секундных клипов.",
    section: "video",
    provider: "minimax",
    costUsdPerRequest: 0.35,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9"],
    supportedDurations: [6, 10],
    settings: [
      mkDurationSelect([6, 10]),
      {
        key: "resolution",
        label: "Разрешение видео",
        description:
          "1080p — Full HD, только для 6-секундных клипов. 768p — для любой длины включая 10с.",
        type: "select",
        options: [
          { value: "768P", label: "768p" },
          { value: "1080P", label: "1080p" },
        ],
        default: "1080P",
      },
    ],
  },
  "higgsfield-lite": {
    id: "higgsfield-lite",
    name: "🎬 Higgsfield Lite",
    description:
      "Специализируется на реалистичной анимации людей — мимика, жесты, движения тела выглядят естественно.",
    section: "video",
    provider: "higgsfield",
    familyId: "higgsfield",
    variantLabel: "Lite",
    costUsdPerRequest: 0.125,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [5],
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      {
        key: "motions",
        label: "Пресеты движений",
        description:
          "Выберите один или несколько пресетов движения камеры. Можно комбинировать несколько одновременно.",
        type: "motion-picker",
        default: null,
      },
      {
        key: "enhance_prompt",
        label: "Улучшение промпта",
        description:
          "Автоматически улучшает ваш промпт с помощью ИИ для более детального результата.",
        type: "toggle",
        default: true,
      },
      {
        key: "seed",
        label: "Seed",
        description:
          "Фиксирует случайность генерации для воспроизводимых результатов (1–1 000 000). Оставьте пустым для случайного.",
        type: "number",
        min: 1,
        max: 1000000,
        default: null,
      },
    ],
  },
  higgsfield: {
    id: "higgsfield",
    name: "🎬 Higgsfield Turbo",
    description:
      "Специализируется на реалистичной анимации людей — мимика, жесты, движения тела выглядят естественно.",
    section: "video",
    provider: "higgsfield",
    familyId: "higgsfield",
    variantLabel: "Turbo",
    costUsdPerRequest: 0.406,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [5],
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      {
        key: "motions",
        label: "Пресеты движений",
        description:
          "Выберите один или несколько пресетов движения камеры. Можно комбинировать несколько одновременно.",
        type: "motion-picker",
        default: null,
      },
      {
        key: "enhance_prompt",
        label: "Улучшение промпта",
        description:
          "Автоматически улучшает ваш промпт с помощью ИИ для более детального результата.",
        type: "toggle",
        default: true,
      },
      {
        key: "seed",
        label: "Seed",
        description:
          "Фиксирует случайность генерации для воспроизводимых результатов (1–1 000 000). Оставьте пустым для случайного.",
        type: "number",
        min: 1,
        max: 1000000,
        default: null,
      },
    ],
  },
  "higgsfield-preview": {
    id: "higgsfield-preview",
    name: "🎬 Higgsfield Preview",
    description:
      "Специализируется на реалистичной анимации людей — мимика, жесты, движения тела выглядят естественно.",
    section: "video",
    provider: "higgsfield",
    familyId: "higgsfield",
    variantLabel: "Preview",
    descriptionOverride:
      "Флагманская версия с максимальным качеством — наиболее реалистичное освещение, детали и кинематографичность.",
    costUsdPerRequest: 0.563,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: [5],
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      {
        key: "motions",
        label: "Пресеты движений",
        description:
          "Выберите один или несколько пресетов движения камеры. Можно комбинировать несколько одновременно.",
        type: "motion-picker",
        default: null,
      },
      {
        key: "enhance_prompt",
        label: "Улучшение промпта",
        description:
          "Автоматически улучшает ваш промпт с помощью ИИ для более детального результата.",
        type: "toggle",
        default: true,
      },
      {
        key: "seed",
        label: "Seed",
        description:
          "Фиксирует случайность генерации для воспроизводимых результатов (1–1 000 000). Оставьте пустым для случайного.",
        type: "number",
        min: 1,
        max: 1000000,
        default: null,
      },
    ],
  },
  wan: {
    id: "wan",
    name: "Wan 2.5 (Alibaba)",
    description:
      "Создаёт качественные видео с плавным естественным движением. Хорошо справляется со сложными сценами и динамичными действиями.",
    section: "video",
    provider: "alibaba",
    // $0.07/s at 720p (default), $0.036/s at 480p
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.07,
    costVariants: {
      settingKey: "resolution",
      map: { "480p": { costUsdPerSecond: 0.036 }, "720p": { costUsdPerSecond: 0.07 } },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: null,
    durationRange: { min: 5, max: 15 },
    settings: [
      mkAspectRatio(["16:9", "9:16"]),
      mkDurationSlider(5, 15),
      {
        key: "negative_prompt",
        label: "Негативный промпт",
        description:
          "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
        type: "text",
        default: "",
      },
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "720p — чёткое HD-видео, 480p — быстрее генерируется. Влияет на цену.",
        type: "select",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
        ],
        default: "720p",
      },
      {
        key: "motion_strength",
        label: "Интенсивность движения",
        description:
          "Насколько активно движется видео: ниже — плавнее и статичнее, выше — больше динамики.",
        type: "slider",
        min: 0.3,
        max: 0.7,
        step: 0.05,
        default: 0.5,
      },
    ],
  },
  heygen: {
    id: "heygen",
    name: "HeyGen",
    description:
      "Особенно популярен среди соло-креаторов, инфлюенсеров и небольших команд. Для аватаров, lip-sync, перевода видео на 175+ языков.",
    section: "video",
    provider: "heygen",
    costUsdPerRequest: 1.5, // ~$1–$2/min video
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: true,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: null, // avatar duration is script-driven
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      {
        key: "avatar_id",
        label: "Аватар",
        description: "Выберите официальный аватар HeyGen или загрузите собственное фото.",
        type: "avatar-picker",
        default: "",
      },
      {
        key: "voice_id",
        label: "Голос",
        description: "Выберите голос аватара из списка официальных голосов HeyGen.",
        type: "voice-picker",
        default: "",
      },
      {
        key: "background_color",
        label: "Цвет фона",
        type: "color",
        default: "#FFFFFF",
      },
    ],
  },
  "d-id": {
    id: "d-id",
    name: "D-ID",
    description:
      "Оживляет фотографии и аватары. Синхронизирует речь с движением губ для создания реалистичных говорящих персонажей.",
    section: "video",
    provider: "d-id",
    costUsdPerRequest: 1.13, // 1.13/min
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: true,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations: null, // script-driven
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1"]),
      {
        key: "sentiment",
        label: "Настроение аватара",
        description: "Эмоциональный тон выступления аватара (выражение лица).",
        type: "select",
        options: [
          { value: "neutral", label: "Нейтральное" },
          { value: "happy", label: "Радостное" },
          { value: "surprise", label: "Удивлённое" },
          { value: "serious", label: "Серьёзное" },
        ],
        default: "neutral",
      },
      {
        key: "driver_url",
        label: "URL видео-драйвера",
        description: "URL видео, задающего движения лица/головы аватара.",
        type: "text",
        default: "",
      },
      {
        key: "voice_id",
        label: "Голос",
        description: "Выберите голос для озвучки или используйте свою запись.",
        type: "did-voice-picker",
        default: "",
      },
    ],
  },

  // ── Аудио ─────────────────────────────────────────────────────────────────
  "tts-openai": {
    id: "tts-openai",
    name: "Синтез речи (OpenAI)",
    description:
      "Синтез речи от OpenAI. Несколько голосов, естественная интонация и быстрая генерация для любого текста.",
    section: "audio",
    provider: "openai",
    costUsdPerRequest: 0,
    costUsdPerKChar: 0.015, // tts-1: $0.015/1K chars (default)
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    costVariants: {
      settingKey: "model",
      map: {
        "tts-1": { costUsdPerKChar: 0.015 },
        "tts-1-hd": { costUsdPerKChar: 0.03 },
        "gpt-4o-mini-tts": { costUsdPerKChar: 0.015 },
      },
    },
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    settings: [
      {
        key: "model",
        label: "Модель TTS",
        description:
          "tts-1 — стандартное качество, tts-1-hd — высокое качество, gpt-4o-mini-tts — управляемый стиль речи через инструкции. Влияет на цену.",
        type: "select",
        options: [
          { value: "tts-1", label: "TTS-1 (Standard)" },
          { value: "tts-1-hd", label: "TTS-1 HD" },
          { value: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS" },
        ],
        default: "tts-1",
      },
      {
        key: "voice",
        label: "Голос",
        description:
          "Тембр и стиль диктора. Alloy и Echo — нейтральные, Onyx — глубокий мужской, Nova и Shimmer — женские.",
        type: "select",
        options: [
          { value: "alloy", label: "Alloy" },
          { value: "ash", label: "Ash" },
          { value: "ballad", label: "Ballad" },
          { value: "coral", label: "Coral" },
          { value: "echo", label: "Echo" },
          { value: "fable", label: "Fable" },
          { value: "nova", label: "Nova" },
          { value: "onyx", label: "Onyx" },
          { value: "sage", label: "Sage" },
          { value: "shimmer", label: "Shimmer" },
          { value: "verse", label: "Verse" },
        ],
        default: "onyx",
      },
      {
        key: "speed",
        label: "Скорость речи",
        description: "Темп озвучки: 1.0 — нормальная скорость, ниже — медленнее, выше — быстрее.",
        type: "slider",
        min: 0.25,
        max: 4.0,
        step: 0.05,
        default: 1.0,
      },
      {
        key: "format",
        label: "Формат аудио",
        description: "MP3 — универсальный и компактный, FLAC — без потерь, Opus — для стриминга.",
        type: "select",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "opus", label: "Opus" },
          { value: "aac", label: "AAC" },
          { value: "flac", label: "FLAC" },
          { value: "wav", label: "WAV" },
        ],
        default: "mp3",
      },
      {
        key: "instructions",
        label: "Инструкции к голосу",
        description:
          "Только для gpt-4o-mini-tts: укажите тон, эмоцию и стиль речи. Например: 'Говори медленно и торжественно' или 'Эмоциональный диктор новостей'.",
        type: "text",
        default: "",
      },
    ],
  },
  "voice-clone": {
    id: "voice-clone",
    name: "Клонирование голоса",
    description:
      "Клонирование голоса с высокой точностью. Воспроизводит тембр и интонации исходного голоса по короткому аудиообразцу.",
    section: "audio",
    provider: "elevenlabs",
    costUsdPerRequest: 0,
    costUsdPerKChar: 0.24, // eleven_multilingual_v2: $0.24/1K chars (Pro-тир)
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    costVariants: {
      settingKey: "model_id",
      map: {
        eleven_multilingual_v2: { costUsdPerKChar: 0.24 },
        eleven_turbo_v2_5: { costUsdPerKChar: 0.12 }, // 0.5 кредита/символ — в 2× дешевле
      },
    },
    supportsImages: false,
    supportsVoice: true,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    settings: [
      {
        key: "model_id",
        label: "Модель синтеза",
        description:
          "multilingual_v2 — максимальное качество (дороже), turbo_v2_5 — быстрее и в 2× дешевле, 32 языка.",
        type: "select",
        options: [
          { value: "eleven_multilingual_v2", label: "Multilingual v2 (макс. качество)" },
          { value: "eleven_turbo_v2_5", label: "Turbo v2.5 (быстрее, дешевле)" },
        ],
        default: "eleven_multilingual_v2",
      },
      {
        key: "stability",
        label: "Стабильность",
        description:
          "Однородность голоса: высокое значение — ровно и монотонно, низкое — эмоциональнее и разнообразнее.",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5,
      },
      {
        key: "similarity_boost",
        label: "Схожесть с оригиналом",
        description:
          "Насколько точно воспроизводится оригинальный тембр и интонации голоса-образца.",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.75,
      },
      {
        key: "style",
        label: "Выразительность стиля",
        description:
          "Насколько актёрски и эмоционально звучит речь: 0 — нейтрально, 1 — максимально выразительно.",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.0,
      },
      {
        key: "use_speaker_boost",
        label: "Speaker Boost",
        description: "Усиление качества и чёткости голоса. Рекомендуется оставить включённым.",
        type: "toggle",
        default: true,
      },
    ],
  },
  suno: {
    id: "suno",
    name: "Генерация музыки (Suno)",
    description:
      "Генерирует полноценные музыкальные треки с вокалом и аранжировкой по текстовому описанию стиля и настроения.",
    section: "audio",
    provider: "suno",
    costUsdPerRequest: 0.035, // ~$0.030–$0.040/track (apipass.net proxy)
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    settings: [
      {
        key: "model_version",
        label: "Версия модели",
        description:
          "chirp-v4 — стандарт, chirp-v4.5 — улучшенное качество (до 8 мин), v5 — последняя версия.",
        type: "select",
        options: [
          { value: "chirp-v4", label: "Chirp v4" },
          { value: "chirp-v4.5", label: "Chirp v4.5 (рекомендуется)" },
          { value: "v5", label: "v5 (последняя)" },
        ],
        default: "chirp-v4.5",
      },
      {
        key: "make_instrumental",
        label: "Только инструментал",
        description: "Сгенерировать музыку без вокала — только инструментальную дорожку.",
        type: "toggle",
        default: false,
      },
      {
        key: "lyrics",
        label: "Текст песни",
        description: "Готовый текст для пения. Если указан — модель не генерирует текст сама.",
        type: "text",
        default: "",
      },
    ],
  },
  "sounds-el": {
    id: "sounds-el",
    name: "Звуковые эффекты (ElevenLabs)",
    description:
      "Генерирует оригинальные звуковые эффекты по описанию. Подходит для видеопроизводства, игр и подкастов.",
    section: "audio",
    provider: "elevenlabs",
    costUsdPerRequest: 0.048, // fallback: AI-determines duration (100 credits)
    costUsdPerSecond: 0.0096, // manual duration: 20 credits/sec × $0.00048/credit
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    settings: [
      {
        key: "duration_seconds",
        label: "Длительность (сек)",
        description:
          "Конкретная длительность в секундах (1–30). Оставьте пустым — модель выберет сама (дешевле: 100 кредитов вместо 20/сек).",
        type: "slider",
        min: 1,
        max: 30,
        step: 1,
        default: null,
      },
    ],
  },
};

// ── Apply settings ────────────────────────────────────────────────────────────
// LLM section — assign base settings plus model-specific extras
const OPENAI_REASONING_IDS = new Set(["o4-mini", "o3", "o3-mini"]);
const OPENAI_CHAT_IDS = new Set([
  "gpt-5.4-pro",
  "gpt-5.4",
  "gpt-5.3",
  "gpt-5-mini",
  "gpt-5-nano",
  "o4-mini",
  "o3",
  "o3-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
]);
const ANTHROPIC_THINKING_IDS = new Set([
  "claude-opus",
  "claude-opus-4-5",
  "claude-sonnet",
  "claude-sonnet-4-5",
]);
const QWEN_THINKING_IDS = new Set(["qwen-3-max-thinking", "qwen-3-thinking", "qwen-3"]);
const GEMINI_THINKING_IDS = new Set(["gemini-2-pro", "gemini-3.1-pro"]);

for (const [id, model] of Object.entries(AI_MODELS)) {
  if (model.section !== "gpt") continue;

  const extras: ModelSettingDef[] = [];

  if (id.startsWith("perplexity")) {
    extras.push(PERPLEXITY_EXTRA, PERPLEXITY_SEARCH_CONTEXT, PERPLEXITY_DOMAIN_FILTER);
  }
  if (OPENAI_REASONING_IDS.has(id)) {
    extras.push(REASONING_EFFORT);
  }
  if (id === "grok-3-mini") {
    extras.push(GROK_MINI_REASONING);
  }
  if (ANTHROPIC_THINKING_IDS.has(id)) {
    extras.push(EXTENDED_THINKING);
  }
  if (QWEN_THINKING_IDS.has(id)) {
    extras.push(ENABLE_THINKING);
  }
  if (GEMINI_THINKING_IDS.has(id)) {
    extras.push(THINKING_BUDGET);
  }
  if (OPENAI_CHAT_IDS.has(id)) {
    extras.push(SEED_SETTING);
  }

  model.settings = [...LLM_SETTINGS, ...extras];
}

// Модели по секции
export const MODELS_BY_SECTION = Object.values(AI_MODELS).reduce(
  (acc, model) => {
    if (!acc[model.section]) acc[model.section] = [];
    acc[model.section].push(model);
    return acc;
  },
  {} as Record<string, AIModel[]>,
);
