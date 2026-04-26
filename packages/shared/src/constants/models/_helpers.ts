import type { ModelSettingDef } from "../../types/ai.js";

// ── Helper builders ───────────────────────────────────────────────────────────

/** Creates an aspect_ratio select setting from an ordered list of ratio strings. */
export function mkAspectRatio(
  ratios: string[],
  labelMap?: Record<string, string>,
): ModelSettingDef {
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
export function mkDurationSelect(durations: number[]): ModelSettingDef {
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
export function mkDurationSlider(min: number, max: number): ModelSettingDef {
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

/**
 * Picker «количество изображений» (1-4) для virtual batch.
 * Применять к single-only моделям (DALL-E, Recraft, gpt-image, FLUX, Ideogram и т.п.),
 * у которых задано `maxVirtualBatch`. Воркер запустит N последовательных submit'ов
 * с разнесением во времени; списание идёт только за успешные.
 */
export const NUM_IMAGES_SETTING: ModelSettingDef = {
  key: "num_images",
  label: "Количество изображений",
  description: "Сгенерировать несколько вариантов за один запрос. Списывается только за успешные.",
  type: "select",
  options: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
  ],
  default: 1,
};
