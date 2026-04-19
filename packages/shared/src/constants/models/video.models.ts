import type { AIModel, MediaInputSlot, ModelSettingDef } from "../../types/ai.js";
import { mkAspectRatio, mkDurationSelect, mkDurationSlider } from "./_helpers.js";

const MI_FIRST_FRAME: MediaInputSlot = {
  slotKey: "first_frame",
  mode: "first_frame",
  labelKey: "firstFrame",
};
const MI_FIRST_FRAME_REQUIRED: MediaInputSlot = {
  slotKey: "first_frame",
  mode: "first_frame",
  labelKey: "firstFrame",
  required: true,
};
const MI_LAST_FRAME: MediaInputSlot = {
  slotKey: "last_frame",
  mode: "last_frame",
  labelKey: "lastFrame",
};
const MI_REFERENCE: MediaInputSlot = {
  slotKey: "reference",
  mode: "reference",
  labelKey: "reference",
};
/** Veo accepts up to 3 reference images; last_frame is ignored when references are present. */
const MI_REFERENCE_VEO: MediaInputSlot = {
  slotKey: "reference",
  mode: "reference",
  labelKey: "reference",
  maxImages: 3,
};

/** Kling element slots: each accepts up to 4 images (1 frontal + 3 refs) OR 1 video. */
const MI_REF_ELEMENTS: MediaInputSlot[] = [1, 2, 3, 4, 5].map((i) => ({
  slotKey: `ref_element_${i}`,
  mode: "reference_element",
  labelKey: `refElement${i}`,
  maxImages: 4,
}));

const KLING_MEDIA_INPUTS: MediaInputSlot[] = [MI_FIRST_FRAME, MI_LAST_FRAME, ...MI_REF_ELEMENTS];

/** Kling Motion: required reference image (image_url). */
const MI_MOTION_IMAGE: MediaInputSlot = {
  slotKey: "first_frame",
  mode: "first_frame",
  labelKey: "motionImage",
  required: true,
};
/** Kling Motion: required reference video (video_url). */
const MI_MOTION_VIDEO: MediaInputSlot = {
  slotKey: "motion_video",
  mode: "motion_video",
  labelKey: "motionVideo",
  required: true,
};
/** Kling Motion: optional facial element (only 1, only with character_orientation="video"). */
const MI_MOTION_ELEMENT: MediaInputSlot = {
  slotKey: "ref_element_1",
  mode: "reference_element",
  labelKey: "motionElement",
  maxImages: 1,
};

const KLING_MOTION_MEDIA_INPUTS: MediaInputSlot[] = [
  MI_MOTION_IMAGE,
  MI_MOTION_VIDEO,
  MI_MOTION_ELEMENT,
];

const KLING_MOTION_SETTINGS: ModelSettingDef[] = [
  {
    key: "character_orientation",
    label: "Ориентация персонажа",
    description:
      "Определяет, чью ориентацию повторит персонаж в результате. «По видео» — ориентация как в референсном видео (лучше для сложных движений, макс. 30 с). «По изображению» — ориентация как на исходном фото (лучше для камерных движений, макс. 10 с).",
    type: "select",
    options: [
      { value: "video", label: "По видео" },
      { value: "image", label: "По изображению" },
    ],
    default: "video",
  },
  {
    key: "keep_original_sound",
    label: "Сохранить звук из видео",
    description: "Перенести оригинальный звук из референсного видео в результат.",
    type: "toggle",
    default: true,
  },
];

/** Wan 2.7 driving audio slot (lip-sync / motion timing). */
const MI_DRIVING_AUDIO: MediaInputSlot = {
  slotKey: "driving_audio",
  mode: "driving_audio",
  labelKey: "drivingAudio",
};
/** Wan 2.7 first-clip slot — video that model continues. */
const MI_FIRST_CLIP: MediaInputSlot = {
  slotKey: "first_clip",
  mode: "first_clip",
  labelKey: "firstClip",
};

/** Seedance 2 first/last frame slots — exclusive with reference slots. */
const MI_SEEDANCE_FIRST_FRAME: MediaInputSlot = {
  ...MI_FIRST_FRAME,
  exclusiveGroup: "frames",
};
const MI_SEEDANCE_LAST_FRAME: MediaInputSlot = {
  ...MI_LAST_FRAME,
  exclusiveGroup: "frames",
};

/** Seedance 2 reference-to-video slots — exclusive with frame slots. */
const MI_REF_IMAGES: MediaInputSlot = {
  slotKey: "ref_images",
  mode: "reference_image",
  labelKey: "referenceImages",
  maxImages: 9,
  exclusiveGroup: "refs",
};
const MI_REF_VIDEOS: MediaInputSlot = {
  slotKey: "ref_videos",
  mode: "reference_video",
  labelKey: "referenceVideos",
  maxImages: 3,
  exclusiveGroup: "refs",
};
const MI_REF_AUDIOS: MediaInputSlot = {
  slotKey: "ref_audios",
  mode: "reference_audio",
  labelKey: "referenceAudios",
  maxImages: 3,
  exclusiveGroup: "refs",
};

/** Grok Imagine i2v: up to 7 reference images, referenced via @image1..@image7 in prompt. */
const MI_GROK_IMAGINE_REFS: MediaInputSlot = {
  slotKey: "ref_images",
  mode: "reference_image",
  labelKey: "referenceImages",
  maxImages: 7,
};

const KLING_SETTINGS: ModelSettingDef[] = [
  mkAspectRatio(["16:9", "9:16", "1:1"]),
  {
    key: "duration",
    label: "Длительность",
    description: "Продолжительность видеоклипа в секундах.",
    type: "slider",
    default: 5,
    min: 3,
    max: 15,
    step: 1,
  },
  {
    key: "cfg_scale",
    label: "Следование промпту (CFG)",
    description:
      "Насколько точно видео передаёт ваше описание: ближе к 1 — строже по тексту, ближе к 0 — больше свободы.",
    type: "slider",
    min: 0,
    max: 1,
    step: 0.1,
    default: 0.5,
    advanced: true,
  },
  {
    key: "negative_prompt",
    label: "Негативный промпт",
    description: "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
    type: "text",
    default: "",
    advanced: true,
  },
  {
    key: "generate_audio",
    label: "Генерировать аудио",
    description: "Включить автоматическую генерацию звукового сопровождения к видео.",
    type: "toggle",
    default: true,
  },
];

export const VIDEO_MODELS: Record<string, AIModel> = {
  // ── Видео ─────────────────────────────────────────────────────────────────
  kling: {
    id: "kling",
    name: "🎥 Kling 3.0",
    description:
      "Генерирует видео до 15 секунд со звуком. Лучше всех передаёт движения людей. Стандартная версия — быстрее и дешевле Pro.",
    section: "video",
    provider: "fal",
    familyId: "kling",
    variantLabel: "Standard",
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
    mediaInputs: KLING_MEDIA_INPUTS,
    durationRange: { min: 3, max: 15 },
    settings: [...KLING_SETTINGS],
  },

  "kling-pro": {
    id: "kling-pro",
    name: "🎥 Kling 3.0 Pro",
    description:
      "Генерирует видео до 15 секунд со звуком. Лучше всех передаёт движения людей. Pro-версия — повышенная детализация и качество движений.",
    section: "video",
    provider: "fal",
    familyId: "kling",
    variantLabel: "Pro",
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
    mediaInputs: KLING_MEDIA_INPUTS,
    durationRange: { min: 3, max: 15 },
    settings: [...KLING_SETTINGS],
  },

  seedance: {
    id: "seedance",
    name: "💃 Seedance 1.5 Pro (ByteDance)",
    description:
      "Создаёт видео с выразительным движением и генерацией звука. Предыдущее поколение — проверенная стабильность, до 12 секунд. Хорош для креативных и стилизованных роликов.",
    section: "video",
    provider: "fal",
    familyId: "seedance",
    variantLabel: "1.5 Pro",
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
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME],
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

  "seedance-2": {
    id: "seedance-2",
    name: "💃 Seedance 2.0 (ByteDance)",
    description:
      "Новейшая видеомодель ByteDance — значительно выше качество и реалистичность движений по сравнению с 1.5. Встроенный звук, до 15 секунд, широкий выбор соотношений сторон.",
    section: "video",
    provider: "kie",
    familyId: "seedance",
    variantLabel: "2.0 Standard",
    // Per-second billing, varies by resolution × generate_audio
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.125,
    costMatrix: {
      dims: ["resolution", "generate_audio"],
      table: {
        "480p__true": 0.0575,
        "480p__false": 0.095,
        "720p__true": 0.125,
        "720p__false": 0.205,
        "1080p__true": 0.31,
        "1080p__false": 0.51,
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    mediaInputs: [
      MI_SEEDANCE_FIRST_FRAME,
      MI_SEEDANCE_LAST_FRAME,
      MI_REF_IMAGES,
      MI_REF_VIDEOS,
      MI_REF_AUDIOS,
    ],
    supportedAspectRatios: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    durationRange: { min: 4, max: 15 },
    settings: [
      mkAspectRatio(["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], { auto: "Авто" }),
      mkDurationSlider(4, 15),
      {
        key: "resolution",
        label: "Разрешение видео",
        description:
          "480p — быстрее генерируется, 720p — более чёткое видео, 1080p — максимальная детализация. Влияет на цену.",
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
        description:
          "Включить автоматическую генерацию звукового сопровождения к видео. Влияет на цену.",
        type: "toggle",
        default: true,
      },
    ],
  },

  "seedance-2-fast": {
    id: "seedance-2-fast",
    name: "💃 Seedance 2.0 Fast (ByteDance)",
    description:
      "Ускоренная версия Seedance 2.0 — быстрее и дешевле стандарта при схожем качестве. Встроенная генерация звука, до 15 секунд.",
    section: "video",
    provider: "kie",
    familyId: "seedance",
    variantLabel: "2.0 Fast",
    // Per-second billing, varies by resolution × generate_audio
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.1,
    costMatrix: {
      dims: ["resolution", "generate_audio"],
      table: {
        "480p__true": 0.045,
        "480p__false": 0.0775,
        "720p__true": 0.1,
        "720p__false": 0.165,
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    mediaInputs: [MI_SEEDANCE_FIRST_FRAME, MI_REF_IMAGES, MI_REF_VIDEOS, MI_REF_AUDIOS],
    supportedAspectRatios: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    durationRange: { min: 4, max: 15 },
    settings: [
      mkAspectRatio(["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], { auto: "Авто" }),
      mkDurationSlider(4, 15),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "480p — быстрее генерируется, 720p — более чёткое видео. Влияет на цену.",
        type: "select",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
        ],
        default: "720p",
      },
      {
        key: "generate_audio",
        label: "Генерировать аудио",
        description:
          "Включить автоматическую генерацию звукового сопровождения к видео. Влияет на цену.",
        type: "toggle",
        default: true,
      },
    ],
  },

  "higgsfield-lite": {
    id: "higgsfield-lite",
    name: "🎬 Higgsfield Lite",
    description:
      "Реалистичная анимация людей — мимика, жесты и движения тела. Lite — самая быстрая и бюджетная версия Higgsfield.",
    section: "video",
    provider: "higgsfield",
    familyId: "higgsfield",
    variantLabel: "Lite",
    costUsdPerRequest: 0.125,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME_REQUIRED],
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
          "Выберите до 2 пресетов движения камеры. Можно комбинировать два пресета одновременно.",
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
        advanced: true,
      },
    ],
  },

  higgsfield: {
    id: "higgsfield",
    name: "🎬 Higgsfield Turbo",
    description:
      "Реалистичная анимация людей — мимика, жесты и движения тела. Turbo — баланс качества и скорости, выше детализация чем Lite.",
    section: "video",
    provider: "higgsfield",
    familyId: "higgsfield",
    variantLabel: "Turbo",
    costUsdPerRequest: 0.406,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME_REQUIRED],
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
          "Выберите до 2 пресетов движения камеры. Можно комбинировать два пресета одновременно.",
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
        advanced: true,
      },
    ],
  },

  "higgsfield-preview": {
    id: "higgsfield-preview",
    name: "🎬 Higgsfield Preview",
    description:
      "Реалистичная анимация людей — мимика, жесты и движения тела. Preview — флагманская версия с максимальным качеством, освещением и кинематографичностью.",
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
    mediaInputs: [MI_FIRST_FRAME_REQUIRED],
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
          "Выберите до 2 пресетов движения камеры. Можно комбинировать два пресета одновременно.",
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
        advanced: true,
      },
    ],
  },

  veo: {
    id: "veo",
    name: "📽️ Veo 3.1",
    description:
      "Видео от Google со звуком и голосами. Поддерживает вертикальный формат для Reels и Shorts. Standard — максимальное качество, выше детализация чем Fast. Можно задать первый и последний кадр — Veo сгенерирует плавный переход между ними.",
    section: "video",
    provider: "google",
    familyId: "veo",
    variantLabel: "Standard",
    // $0.40/s (Veo 3.1 Standard, Gemini API)
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.4,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME, MI_REFERENCE_VEO],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: [4, 6, 8],
    settings: [
      mkAspectRatio(["16:9", "9:16"]),
      {
        key: "duration",
        label: "Длительность",
        description:
          "Продолжительность видеоклипа в секундах. При использовании референсных изображений или разрешений 1080p/4K доступен только вариант 8 с.",
        type: "select",
        options: [
          { value: 4, label: "4 с", unavailableIf: { key: "resolution", neq: "720p" } },
          { value: 6, label: "6 с", unavailableIf: { key: "resolution", neq: "720p" } },
          { value: 8, label: "8 с" },
        ],
        default: 4,
      },
      {
        key: "resolution",
        label: "Разрешение",
        description: "Качество видео: 720p — любая длительность, 1080p — только 8 секунд.",
        type: "select",
        options: [
          { value: "720p", label: "720p" },
          {
            value: "1080p",
            label: "1080p",
            unavailableIf: { key: "duration", neq: 8 },
          },
          {
            value: "4k",
            label: "4k",
            unavailableIf: { key: "duration", neq: 8 },
          },
        ],
        default: "720p",
      },
      {
        key: "person_generation",
        label: "Генерация людей",
        description: "Разрешить ли появление людей в видео.",
        type: "select",
        options: [
          { value: "dont_allow", label: "Запрещено" },
          { value: "allow_adult", label: "Разрешены взрослые" },
        ],
        default: "allow_adult",
      },
      // {
      //   key: "negative_prompt",
      //   label: "Негативный промпт",
      //   description:
      //     "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
      //   type: "text",
      //   default: "",
      //   advanced: true,
      // },
    ],
  },

  "veo-fast": {
    id: "veo-fast",
    name: "📽️ Veo 3.1 Fast",
    description:
      "Быстрая и более доступная версия Veo 3.1 от Google. Со звуком и голосами, но чуть ниже детализация чем Standard. Поддерживает 4K. Можно задать первый и последний кадр — Veo сгенерирует плавный переход между ними.",
    section: "video",
    provider: "google",
    familyId: "veo",
    variantLabel: "Fast",
    // Resolution-based: 720p $0.10/s, 1080p $0.12/s, 4k $0.30/s
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.1,
    costVariants: {
      settingKey: "resolution",
      map: {
        "720p": { costUsdPerSecond: 0.1 },
        "1080p": { costUsdPerSecond: 0.12 },
        "4k": { costUsdPerSecond: 0.3 },
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME, MI_REFERENCE_VEO],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: [4, 6, 8],
    settings: [
      mkAspectRatio(["16:9", "9:16"]),
      {
        key: "duration",
        label: "Длительность",
        description:
          "Продолжительность видеоклипа в секундах. При использовании референсных изображений или разрешений 1080p/4K доступен только вариант 8 с.",
        type: "select",
        options: [
          { value: 4, label: "4 с", unavailableIf: { key: "resolution", neq: "720p" } },
          { value: 6, label: "6 с", unavailableIf: { key: "resolution", neq: "720p" } },
          { value: 8, label: "8 с" },
        ],
        default: 4,
      },
      {
        key: "resolution",
        label: "Разрешение",
        description: "Качество видео: 720p — любая длительность, 1080p — только 8 секунд.",
        type: "select",
        options: [
          { value: "720p", label: "720p" },
          {
            value: "1080p",
            label: "1080p",
            unavailableIf: { key: "duration", neq: 8 },
          },
          {
            value: "4k",
            label: "4k",
            unavailableIf: { key: "duration", neq: 8 },
          },
        ],
        default: "720p",
      },
      // {
      //   key: "negative_prompt",
      //   label: "Негативный промпт",
      //   description:
      //     "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
      //   type: "text",
      //   default: "",
      //   advanced: true,
      // },
    ],
  },

  sora: {
    id: "sora",
    name: "🌌 Sora 2",
    description:
      "Устаревшая модель генерации видео от OpenAI. Объекты двигаются как в реальности, со звуком и правильной физикой. Отправьте фото вместе с текстом — оно станет первым кадром видео.",
    section: "video",
    provider: "openai",
    // $0.10/s (via Replicate openai/sora)
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.1,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_REFERENCE],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    // Native Replicate values: "portrait" (720×1280) and "landscape" (1280×720)
    supportedAspectRatios: ["portrait", "landscape"],
    supportedDurations: [4, 8, 12],
    settings: [
      {
        key: "aspect_ratio",
        label: "Соотношение сторон",
        description: "Portrait — вертикальное видео 720×1280, Landscape — горизонтальное 1280×720.",
        type: "select",
        options: [
          { value: "portrait", label: "Portrait (9:16)" },
          { value: "landscape", label: "Landscape (16:9)" },
        ],
        default: "portrait",
      },
      mkDurationSelect([4, 8, 12]),
    ],
  },

  runway: {
    id: "runway",
    name: "🛫 Runway Gen-4.5",
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
    mediaInputs: [{ ...MI_FIRST_FRAME, required: true }],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["1280:720", "720:1280", "1104:832", "832:1104", "960:960", "1584:672"],
    supportedDurations: [5, 8, 10],
    settings: [
      mkAspectRatio(["1280:720", "720:1280", "1104:832", "832:1104", "960:960", "1584:672"], {
        "1280:720": "Горизонталь 16:9",
        "720:1280": "Вертикаль 9:16",
        "1104:832": "Горизонталь 4:3",
        "832:1104": "Вертикаль 3:4",
        "960:960": "Квадрат 1:1",
        "1584:672": "Широкий 21:9",
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
        advanced: true,
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
        advanced: true,
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
        advanced: true,
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
        advanced: true,
      },
    ],
  },

  heygen: {
    id: "heygen",
    name: "👤 HeyGen",
    description:
      "Особенно популярен среди соло-креаторов, инфлюенсеров и небольших команд. Для аватаров, lip-sync, перевода видео на 175+ языков.",
    section: "video",
    provider: "heygen",
    // $0.05/s (0.04 with 20% discount) Engine IV (Avatar IV — custom photo upload) ≈ $6.00/min
    // + $0.04 flat fee per request (API overhead) (deprecated)
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.04,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: true,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: null, // avatar duration is script-driven
    settings: [
      mkAspectRatio(["16:9", "9:16"]),
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
        description: "Выберите официальный голос HeyGen или клонированный голос ElevenLabs.",
        type: "voice-picker",
        default: "",
      },
      {
        key: "background_color",
        label: "Цвет фона",
        type: "color",
        default: "#FFFFFF",
        advanced: true,
      },
      {
        key: "resolution",
        label: "Разрешение",
        type: "select",
        options: [
          { value: "1080p", label: "1080p" },
          { value: "720p", label: "720p" },
        ],
        default: "1080p",
      },
      {
        key: "expressiveness",
        label: "Выразительность",
        description: "Только для фото-аватара",
        type: "select",
        options: [
          { value: "low", label: "Низкая" },
          { value: "medium", label: "Средняя" },
          { value: "high", label: "Высокая" },
        ],
        default: "low",
        unavailableIf: {
          and: [
            { key: "avatar_id", present: true },
            { key: "image_asset_id", absent: true },
          ],
        },
      },
      {
        key: "motion_prompt",
        label: "Описание движений",
        description: "Только для фото-аватара",
        type: "text",
        default: null,
        advanced: true,
        unavailableIf: {
          and: [
            { key: "avatar_id", present: true },
            { key: "image_asset_id", absent: true },
          ],
        },
      },
      {
        key: "voice_settings_enabled",
        label: "Настроить голос",
        type: "toggle",
        default: false,
        advanced: true,
      },
      {
        key: "voice_speed",
        label: "Скорость речи",
        type: "slider",
        min: 0.5,
        max: 1.5,
        step: 0.1,
        default: 1.0,
        advanced: true,
        unavailableIf: { key: "voice_settings_enabled", absent: true },
      },
      {
        key: "voice_pitch",
        label: "Тон голоса",
        type: "slider",
        min: -50,
        max: 50,
        step: 1,
        default: 0,
        advanced: true,
        unavailableIf: { key: "voice_settings_enabled", absent: true },
      },
      {
        key: "voice_locale",
        label: "Язык голоса",
        type: "dropdown",
        default: null,
        advanced: true,
        options: [
          { value: "", label: "auto" },
          { value: "ru-RU", label: "🇷🇺 Русский" },
          { value: "uk-UA", label: "🇺🇦 Українська" },
          { value: "kk-KZ", label: "🇰🇿 Қазақша" },
          { value: "be-BY", label: "🇧🇾 Беларуская" },
          { value: "uz-UZ", label: "🇺🇿 O'zbek" },
          { value: "az-AZ", label: "🇦🇿 Azərbaycan" },
          { value: "hy-AM", label: "🇦🇲 Հայերեն" },
          { value: "ka-GE", label: "🇬🇪 ქართული" },
          { value: "tg-TJ", label: "🇹🇯 Тоҷикӣ" },
          { value: "tk-TM", label: "🇹🇲 Türkmen" },
          { value: "ky-KG", label: "🇰🇬 Кыргызча" },
          { value: "mn-MN", label: "🇲🇳 Монгол" },
          { value: "lv-LV", label: "🇱🇻 Latviešu" },
          { value: "lt-LT", label: "🇱🇹 Lietuvių" },
          { value: "et-EE", label: "🇪🇪 Eesti" },
          { value: "en-US", label: "🇺🇸 English (US)" },
          { value: "en-GB", label: "🇬🇧 English (UK)" },
          { value: "de-DE", label: "🇩🇪 Deutsch" },
          { value: "zh-CN", label: "🇨🇳 中文" },
          { value: "tr-TR", label: "🇹🇷 Türkçe" },
          { value: "es-ES", label: "🇪🇸 Español" },
          { value: "fr-FR", label: "🇫🇷 Français" },
          { value: "pt-BR", label: "🇧🇷 Português (BR)" },
          { value: "ar-SA", label: "🇸🇦 العربية" },
          { value: "hi-IN", label: "🇮🇳 हिन्दी" },
          { value: "ja-JP", label: "🇯🇵 日本語" },
          { value: "ko-KR", label: "🇰🇷 한국어" },
          { value: "it-IT", label: "🇮🇹 Italiano" },
          { value: "pl-PL", label: "🇵🇱 Polski" },
          { value: "id-ID", label: "🇮🇩 Bahasa Indonesia" },
        ],
        unavailableIf: { key: "voice_settings_enabled", absent: true },
      },
    ],
  },

  "luma-ray2": {
    id: "luma-ray2",
    name: "☀️ Luma: Ray 2",
    description:
      "Реалистичное видео от Luma AI. Плавные движения, кинематографическое качество. Поддерживает фото как первый кадр.",
    section: "video",
    provider: "luma",
    // Per-second billing; rate depends on resolution (default 720p = $0.142/s)
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.142,
    costVariants: {
      settingKey: "resolution",
      map: {
        "540p": { costUsdPerSecond: 0.08 },
        "720p": { costUsdPerSecond: 0.142 },
        "1080p": { costUsdPerSecond: 0.172 },
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
    supportedDurations: [5, 9],
    settings: [
      mkAspectRatio(["16:9", "9:16", "4:3", "3:4", "1:1"]),
      mkDurationSelect([5, 9]),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "540p — дешевле, 720p — стандарт, 1080p — Full HD. Влияет на цену.",
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
    name: "🎦 MiniMax Video-01",
    description:
      "Китайская видеомодель с отличным качеством движения персонажей. Генерирует 6-секундные клипы с высокой плавностью.",
    section: "video",
    provider: "minimax",
    costUsdPerRequest: 0.43,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
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
    name: "📸 Pika 2.2",
    description:
      "Быстрые видео с крутыми спецэффектами: взрывы, плавление, сжатие. Идеально для TikTok и Reels. Поддерживает фото как первый кадр.",
    section: "video",
    provider: "pika",
    // Per-generation flat fee: 720p/5s=$0.20, 1080p/5s=$0.45 (10s assumed ×2)
    costUsdPerRequest: 0.2,
    costMatrix: {
      dims: ["resolution", "duration"],
      table: {
        "720p__5": 0.2,
        "720p__10": 0.4,
        "1080p__5": 0.45,
        "1080p__10": 0.9,
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: null,
    supportedDurations: [5, 10],
    settings: [
      mkDurationSelect([5, 10]),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "720p — быстрее и дешевле, 1080p — Full HD. Влияет на цену.",
        type: "select",
        options: [
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
        default: "720p",
      },
      {
        key: "negative_prompt",
        label: "Негативный промпт",
        description: "Что НЕ должно появляться в видео.",
        type: "text",
        default: "",
        advanced: true,
      },
      {
        key: "seed",
        label: "Seed",
        description: "Зерно генерации для воспроизводимого результата.",
        type: "number",
        min: 0,
        default: null,
        advanced: true,
      },
    ],
  },

  "hailuo-fast": {
    id: "hailuo-fast",
    name: "🎞️ Hailuo 2.3 Fast",
    description:
      "Быстрая версия Hailuo 2.3 от MiniMax — ~40% дешевле стандартной при схожем качестве. Чуть ниже детализация. Требует фото как первый кадр.",
    section: "video",
    provider: "minimax",
    familyId: "minimax",
    variantLabel: "Fast",
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME],
    // Default: 768P × 6s = $0.19. Exact price depends on resolution × duration — see costMatrix.
    costUsdPerRequest: 0.19,
    costMatrix: {
      dims: ["resolution", "duration"],
      table: {
        "768P__6": 0.19,
        "768P__10": 0.32,
        "1080P__6": 0.33,
      },
    },
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
          "768p — для любой длины включая 10с, 1080p — Full HD только для 6-секундных клипов.",
        type: "select",
        options: [
          { value: "768P", label: "768p" },
          { value: "1080P", label: "1080p" },
        ],
        default: "768P",
      },
    ],
  },

  hailuo: {
    id: "hailuo",
    name: "🎞️ Hailuo 2.3",
    description:
      "Стандартная версия Hailuo 2.3 от MiniMax — максимальное качество, поддержка 1080p и 10-секундных клипов. Принимает фото как первый кадр.",
    section: "video",
    provider: "minimax",
    familyId: "minimax",
    variantLabel: "Standard",
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME],
    // Default: 768P × 6s = $0.28. Exact price depends on resolution × duration — see costMatrix.
    costUsdPerRequest: 0.28,
    costMatrix: {
      dims: ["resolution", "duration"],
      table: {
        "768P__6": 0.28,
        "768P__10": 0.56,
        "1080P__6": 0.49,
      },
    },
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
      {
        key: "duration",
        label: "Длительность",
        description: "Продолжительность видеоклипа в секундах.",
        type: "select",
        options: [
          { value: 6, label: "6 с" },
          { value: 10, label: "10 с", unavailableIf: { key: "resolution", eq: "1080P" } },
        ],
        default: 6,
      },
      {
        key: "resolution",
        label: "Разрешение видео",
        description:
          "768p — для любой длины включая 10с, 1080p — Full HD только для 6-секундных клипов.",
        type: "select",
        options: [
          { value: "768P", label: "768p" },
          { value: "1080P", label: "1080p", unavailableIf: { key: "duration", eq: 10 } },
        ],
        default: "768P",
      },
    ],
  },

  wan: {
    id: "wan",
    name: "🏯 Wan 2.7 (Alibaba)",
    description:
      "Видеомодель Alibaba с высоким качеством движения и поддержкой 1080p. Поддерживает три режима: image-to-video (первый кадр, опционально последний кадр и driving audio) и video continuation (начальный клип, опционально последний кадр). Без медиа — text-to-video с соотношением из настроек.",
    section: "video",
    provider: "alibaba",
    // Per-second billing: 720P=$0.10/s, 1080P=$0.15/s (international endpoint)
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.1,
    costVariants: {
      settingKey: "resolution",
      map: {
        "720P": { costUsdPerSecond: 0.1 },
        "1080P": { costUsdPerSecond: 0.15 },
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_FIRST_FRAME, MI_LAST_FRAME, MI_DRIVING_AUDIO, MI_FIRST_CLIP],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    supportedDurations: null,
    durationRange: { min: 2, max: 15 },
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1", "4:3", "3:4"]),
      mkDurationSlider(2, 15),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "720P — стандартное HD, 1080P — Full HD. Влияет на цену.",
        type: "select",
        options: [
          { value: "720P", label: "720p" },
          { value: "1080P", label: "1080p" },
        ],
        default: "720P",
      },
      {
        key: "prompt_extend",
        label: "Улучшение промпта",
        description:
          "Автоматически расширяет ваш промпт через LLM для более детального результата.",
        type: "toggle",
        default: true,
      },
      {
        key: "negative_prompt",
        label: "Негативный промпт",
        description:
          "Что НЕ должно появляться в видео. Перечислите нежелательные объекты или стили.",
        type: "text",
        default: "",
        advanced: true,
      },
      {
        key: "seed",
        label: "Seed",
        description: "Зерно генерации для воспроизводимого результата. Пусто — случайный.",
        type: "number",
        min: 0,
        max: 2147483647,
        default: null,
        advanced: true,
      },
    ],
  },

  "kling-motion": {
    id: "kling-motion",
    name: "🎥 Kling Motion",
    description:
      "Переносит движения из референсного видео на любого персонажа с изображения. Standard-версия — быстрее и дешевле Pro. Идеален для портретов и простых анимаций.",
    section: "video",
    provider: "fal",
    familyId: "kling-motion",
    variantLabel: "Standard",
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.126,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    promptOptional: true,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    mediaInputs: KLING_MOTION_MEDIA_INPUTS,
    settings: [...KLING_MOTION_SETTINGS],
  },

  "kling-motion-pro": {
    id: "kling-motion-pro",
    name: "🎥 Kling Motion Pro",
    description:
      "Переносит движения из референсного видео на любого персонажа с изображения. Pro-версия — повышенная точность переноса и детализация.",
    section: "video",
    provider: "fal",
    familyId: "kling-motion",
    variantLabel: "Pro",
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.168,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    supportsVoice: false,
    supportsWeb: false,
    promptOptional: true,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    mediaInputs: KLING_MOTION_MEDIA_INPUTS,
    settings: [...KLING_MOTION_SETTINGS],
  },

  "grok-imagine": {
    id: "grok-imagine",
    name: "🔮 Grok Imagine",
    description:
      "Видеомодель от xAI (Grok). Text-to-video и image-to-video с длительностью 6–30 секунд. Поддержка до 7 входных изображений — ссылайтесь на них в промпте через @image1, @image2 и т.д.",
    section: "video",
    provider: "kie",
    // Resolution-based: 480p $0.008/s, 720p $0.015/s
    costUsdPerRequest: 0,
    costUsdPerSecond: 0.008,
    costVariants: {
      settingKey: "resolution",
      map: {
        "480p": { costUsdPerSecond: 0.008 },
        "720p": { costUsdPerSecond: 0.015 },
      },
    },
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: true,
    mediaInputs: [MI_GROK_IMAGINE_REFS],
    supportsVoice: false,
    supportsWeb: false,
    isAsync: true,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    supportedAspectRatios: ["2:3", "3:2", "1:1", "16:9", "9:16"],
    durationRange: { min: 6, max: 30 },
    settings: [
      mkAspectRatio(["16:9", "9:16", "1:1", "2:3", "3:2"]),
      mkDurationSlider(6, 30),
      {
        key: "resolution",
        label: "Разрешение видео",
        description: "480p — быстрее и дешевле, 720p — более чёткое видео. Влияет на цену.",
        type: "select",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
        ],
        default: "480p",
      },
      {
        key: "mode",
        label: "Режим генерации",
        description:
          "Fun — более креативная и игривая интерпретация, Normal — сбалансированный подход.",
        type: "select",
        options: [
          { value: "fun", label: "Fun" },
          { value: "normal", label: "Normal" },
        ],
        default: "normal",
      },
      // {
      //   key: "nsfw_checker",
      //   label: "Фильтр контента",
      //   description:
      //     "Включить фильтрацию контента провайдером. При отключении результаты возвращаются напрямую от модели без дополнительной проверки.",
      //   type: "toggle",
      //   default: false,
      // },
    ],
  },

  // "d-id": {
  //   id: "d-id",
  //   name: "🤳 D-ID",
  //   description:
  //     "Оживляет фотографии и аватары. Синхронизирует речь с движением губ для создания реалистичных говорящих персонажей.",
  //   section: "video",
  //   provider: "d-id",
  //   // $0.018/s (Pro plan, 1 credit = 15s ≈ $0.27/credit) ≈ $1.07/min
  //   // API streaming users get 50% discount → ~$0.009/s ≈ $0.54/min
  //   costUsdPerRequest: 0,
  //   costUsdPerSecond: 0.018,
  //   inputCostUsdPerMToken: 0,
  //   outputCostUsdPerMToken: 0,
  //   supportsImages: true,
  //   supportsVoice: true,
  //   supportsWeb: false,
  //   isAsync: true,
  //   contextStrategy: "db_history",
  //   contextMaxMessages: 0,
  //   supportedAspectRatios: ["16:9", "9:16", "1:1"],
  //   supportedDurations: null, // script-driven
  //   settings: [
  //     mkAspectRatio(["16:9", "9:16", "1:1"]),
  //     {
  //       key: "sentiment",
  //       label: "Настроение аватара",
  //       description: "Эмоциональный тон выступления аватара (выражение лица).",
  //       type: "select",
  //       options: [
  //         { value: "neutral", label: "Нейтральное" },
  //         { value: "happy", label: "Радостное" },
  //         { value: "surprise", label: "Удивлённое" },
  //         { value: "serious", label: "Серьёзное" },
  //       ],
  //       default: "neutral",
  //     },
  //     {
  //       key: "emotion_intensity",
  //       label: "Интенсивность эмоции",
  //       description:
  //         "Насколько ярко выражена эмоция на лице аватара. Применяется только при настроении, отличном от нейтрального.",
  //       type: "slider",
  //       min: 0,
  //       max: 1,
  //       step: 0.1,
  //       default: 0.7,
  //       unavailableIf: { key: "sentiment", eq: "neutral" },
  //     },
  //     {
  //       key: "voice_id",
  //       label: "Голос",
  //       description: "Выберите официальный голос или клонированный голос ElevenLabs.",
  //       type: "did-voice-picker",
  //       default: "",
  //     },
  //   ],
  // },
};
