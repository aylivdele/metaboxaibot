import type { AIModel } from "../../types/ai.js";

export const AUDIO_MODELS: Record<string, AIModel> = {
  // ── Аудио ─────────────────────────────────────────────────────────────────
  "tts-openai": {
    id: "tts-openai",
    name: "🔊 Синтез речи (OpenAI)",
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
    name: "🎤 Клонирование голоса",
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
    name: "🎵 Генерация музыки (Suno)",
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
    name: "🔔 Звуковые эффекты (ElevenLabs)",
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
          "Конкретная длительность в секундах (1–30). Оставьте пустым — модель выберет сама (будет дешевле).",
        type: "slider",
        min: 1,
        max: 30,
        step: 1,
        default: null,
      },
      {
        key: "prompt_influence",
        label: "Влияние промпта",
        description:
          "Насколько точно звук следует описанию (0.0–1.0). Ниже — больше вариативности.",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.3,
      },
    ],
  },
};
