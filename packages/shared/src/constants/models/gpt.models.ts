import type { AIModel, ModelSettingDef } from "../../types/ai.js";

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

/** Reasoning effort for OpenAI o-series and Grok reasoning models (low/medium/high). */
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

/**
 * Reasoning effort for gpt-5.4 / gpt-5.4-pro — supported: medium, high, xhigh.
 */
const REASONING_EFFORT_GPT5: ModelSettingDef = {
  key: "reasoning_effort",
  label: "Глубина рассуждений",
  description: "medium — сбалансировано, xhigh — максимальная точность для сложных задач.",
  type: "select",
  options: [
    { value: "medium", label: "Средняя" },
    { value: "high", label: "Высокая" },
    { value: "xhigh", label: "Макс." },
  ],
  default: "medium",
};

/**
 * Reasoning effort for gpt-5-pro — only "high" is supported.
 */
const REASONING_EFFORT_GPT5_PRO: ModelSettingDef = {
  key: "reasoning_effort",
  label: "Глубина рассуждений",
  description: "gpt-5-pro поддерживает только максимальный уровень рассуждений.",
  type: "select",
  options: [{ value: "high", label: "Высокая" }],
  default: "high",
};

/** Output verbosity for gpt-5 family models. */
const VERBOSITY_SETTING: ModelSettingDef = {
  key: "verbosity",
  label: "Подробность ответа",
  description:
    "low — краткие ответы, medium — сбалансировано, high — развёрнуто (для объяснений и аналитики).",
  type: "select",
  options: [
    { value: "low", label: "Краткий" },
    { value: "medium", label: "Стандартный" },
    { value: "high", label: "Подробный" },
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

/**
 * Settings for reasoning models (gpt-5 family, o-series) — no temperature.
 * Temperature is unsupported by these models via the Responses API.
 */
const REASONING_MODEL_SETTINGS: ModelSettingDef[] = [
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

export const GPT_MODELS: Record<string, AIModel> = {
  // ── GPT / LLM ─────────────────────────────────────────────────────────────
  // LLM models have costUsdPerRequest = 0; cost is entirely token-driven.
  // Per-token prices sourced from provider pricing pages (2026-03-17).
  // Order matches the mini-app display order.

  // ── GPT 5 ─────────────────────────────────────────────────────────────────
  "gpt-5.4-pro": {
    id: "gpt-5.4-pro",
    name: "🧠 GPT 5.4 Pro",
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
    settings: [REASONING_EFFORT_GPT5, VERBOSITY_SETTING, ...REASONING_MODEL_SETTINGS],
  },
  "gpt-5.4": {
    id: "gpt-5.4",
    name: "💬 GPT 5.4",
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
    settings: [REASONING_EFFORT_GPT5, VERBOSITY_SETTING, ...REASONING_MODEL_SETTINGS],
  },
  "gpt-5-pro": {
    id: "gpt-5-pro",
    name: "💡 GPT 5 Pro",
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
    settings: [REASONING_EFFORT_GPT5_PRO, VERBOSITY_SETTING, ...REASONING_MODEL_SETTINGS],
  },
  // "gpt-5-mini": { //TODO: verify account org
  //   id: "gpt-5-mini",
  //   name: "🌀 GPT 5 Mini",
  //   description: "Компактная и быстрая, хороша для повседневных задач.",
  //   section: "gpt",
  //   provider: "openai",
  //   costUsdPerRequest: 0,
  //   inputCostUsdPerMToken: 0.25,
  //   outputCostUsdPerMToken: 2.0,
  //   supportsImages: true,
  //   supportsVoice: false,
  //   supportsWeb: false,
  //   isAsync: false,
  //   contextStrategy: "provider_chain",
  //   contextMaxMessages: 0,
  //   settings: [VERBOSITY_SETTING, ...REASONING_MODEL_SETTINGS],
  // },
  "gpt-5-nano": {
    id: "gpt-5-nano",
    name: "✨ GPT 5 Nano",
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
    settings: [VERBOSITY_SETTING, ...REASONING_MODEL_SETTINGS],
  },
  "o4-mini": {
    id: "o4-mini",
    name: "🔬 GPT-o4 Mini",
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
    settings: [REASONING_EFFORT, ...REASONING_MODEL_SETTINGS],
  },
  // o3: {
  //   id: "o3",
  //   name: "🧩 GPT-o3",
  //   description: "Мощная reasoning-модель OpenAI, глубокие рассуждения для самых сложных задач.",
  //   section: "gpt",
  //   provider: "openai",
  //   costUsdPerRequest: 0,
  //   inputCostUsdPerMToken: 2.0,
  //   outputCostUsdPerMToken: 8.0,
  //   supportsImages: true,
  //   supportsVoice: false,
  //   supportsWeb: false,
  //   isAsync: false,
  //   contextStrategy: "provider_chain",
  //   contextMaxMessages: 0,
  //   settings: [REASONING_EFFORT, ...REASONING_MODEL_SETTINGS],
  // },
  "o3-mini": {
    id: "o3-mini",
    name: "🔩 GPT-o3 Mini",
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
    settings: [REASONING_EFFORT, ...REASONING_MODEL_SETTINGS],
  },
  // ── Anthropic ─────────────────────────────────────────────────────────────
  "claude-opus": {
    id: "claude-opus",
    name: "🎭 Claude 4.6 Opus",
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
    name: "🃏 Claude 4.5 Opus",
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
    name: "📜 Claude 4.6 Sonnet",
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
    name: "🖊️ Claude 4.5 Sonnet",
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
    name: "🍃 Claude 4.5 Haiku",
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
    name: "💎 Gemini 3 Pro",
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
    name: "💍 Gemini 3.1 Pro",
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
    name: "🌟 Gemini 2.5 Flash",
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
    name: "⭐ Gemini 2.5 Flash Lite",
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
    name: "🔍 DeepSeek R1",
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
    name: "🐋 DeepSeek V3",
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
    name: "🤖 Grok 4",
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
    name: "🏎️ Grok 4-fast",
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
    name: "🌐 Perplexity Sonar Pro + Internet",
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
    name: "🔭 Perplexity Sonar Deep Research",
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
    name: "📡 Perplexity Sonar + Internet",
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
    name: "🧮 Qwen 3 Max Thinking",
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
    name: "💭 Qwen 3 Thinking",
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
    name: "🏮 Qwen 3",
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
};

// ── Apply settings ────────────────────────────────────────────────────────────
// Models with explicitly defined settings (e.g. gpt-5 family, o-series) are skipped.
// All other LLM models get LLM_SETTINGS + provider-specific extras.
const GROK_REASONING_IDS = new Set(["grok-4", "grok-4-fast"]);
const ANTHROPIC_THINKING_IDS = new Set([
  "claude-opus",
  "claude-opus-4-5",
  "claude-sonnet",
  "claude-sonnet-4-5",
]);
const QWEN_THINKING_IDS = new Set(["qwen-3-max-thinking", "qwen-3-thinking", "qwen-3"]);
const GEMINI_THINKING_IDS = new Set([
  "gemini-2-flash",
  "gemini-2-pro",
  "gemini-3-pro",
  "gemini-3.1-pro",
]);

for (const [id, model] of Object.entries(GPT_MODELS)) {
  if (model.settings) continue; // already explicitly set — do not overwrite

  const extras: ModelSettingDef[] = [];

  if (id.startsWith("perplexity")) {
    extras.push(PERPLEXITY_EXTRA, PERPLEXITY_SEARCH_CONTEXT, PERPLEXITY_DOMAIN_FILTER);
  }
  if (id === "grok-3-mini") {
    extras.push(GROK_MINI_REASONING);
  }
  if (GROK_REASONING_IDS.has(id)) {
    extras.push(REASONING_EFFORT);
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
  model.settings = [...LLM_SETTINGS, ...extras];
}
