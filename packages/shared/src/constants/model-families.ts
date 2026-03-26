import type { ModelFamily } from "../types/ai.js";

/**
 * Model family definitions.
 * Each family groups related variants (versions × variants) under one name
 * shown in the bot menu. Users drill into version/variant/settings in the mini-app.
 */
export const MODEL_FAMILIES: Record<string, ModelFamily> = {
  // ── Image families ─────────────────────────────────────────────────────────

  recraft: {
    id: "recraft",
    name: "🖌️ Recraft",
    section: "design",
    description:
      "Профессиональная генерация изображений с детальным контролем стиля. Поддерживает растровые (PNG) и векторные (SVG) форматы. Pro-вариант добавляет улучшенное качество и детализацию.",
    defaultModelId: "recraft-v4",
    members: [
      { modelId: "recraft-v3", versionLabel: "v3", variantLabel: "Standard" },
      { modelId: "recraft-v4", versionLabel: "v4", variantLabel: "Standard" },
      { modelId: "recraft-v4-pro", versionLabel: "v4", variantLabel: "Pro" },
      {
        modelId: "recraft-v4-vector",
        versionLabel: "v4",
        variantLabel: "Vector",
        descriptionOverride:
          "Генерирует масштабируемую векторную графику (SVG). Идеален для логотипов, иконок и иллюстраций, которые нужно масштабировать без потери качества.",
      },
      {
        modelId: "recraft-v4-pro-vector",
        versionLabel: "v4",
        variantLabel: "Pro Vector",
        descriptionOverride:
          "Pro-версия векторной генерации. Максимальное качество SVG с улучшенной детализацией и точностью форм.",
      },
    ],
  },

  flux: {
    id: "flux",
    name: "⚡ FLUX",
    section: "design",
    description:
      "Генерация изображений с оплатой за мегапиксель — платите только за фактическое разрешение. FLUX.2 — быстрый и качественный; Pro-вариант добавляет повышенную детализацию и фотореализм.",
    defaultModelId: "flux",
    members: [
      { modelId: "flux", versionLabel: "2", variantLabel: "Standard" },
      { modelId: "flux-pro", versionLabel: "2", variantLabel: "Pro" },
    ],
  },

  seedream: {
    id: "seedream",
    name: "🛍️ Seedream",
    section: "design",
    description:
      "Модель от ByteDance с высокой эстетикой и пониманием текста на изображениях. Версия 5.0 — актуальная, 4.5 — быстрее и дешевле.",
    defaultModelId: "seedream-5",
    members: [
      { modelId: "seedream-4.5", versionLabel: "4.5", variantLabel: "Standard" },
      { modelId: "seedream-5", versionLabel: "5.0", variantLabel: "Standard" },
    ],
  },

  "nano-banana": {
    id: "nano-banana",
    name: "🍌 Nano Banana",
    section: "design",
    description:
      "Генерирует реалистичные фото и позволяет менять детали прямо словами: «убери фон», «добавь шляпу», «сделай вечер». Версия 2 добавляет поиск в интернете и усиленное мышление для более точного следования промпту.",
    defaultModelId: "nano-banana-2",
    members: [
      { modelId: "nano-banana-pro", versionLabel: "1", variantLabel: "Pro" },
      { modelId: "nano-banana-2", versionLabel: "2", variantLabel: "Standard" },
    ],
  },
};

/** All families grouped by section (e.g. "design", "video"). */
export const FAMILIES_BY_SECTION: Record<string, ModelFamily[]> = Object.values(
  MODEL_FAMILIES,
).reduce(
  (acc, f) => {
    if (!acc[f.section]) acc[f.section] = [];
    acc[f.section].push(f);
    return acc;
  },
  {} as Record<string, ModelFamily[]>,
);

/** Fast lookup: modelId → familyId. */
export const MODEL_TO_FAMILY: Record<string, string> = Object.values(MODEL_FAMILIES).reduce(
  (acc, f) => {
    for (const m of f.members) acc[m.modelId] = f.id;
    return acc;
  },
  {} as Record<string, string>,
);
