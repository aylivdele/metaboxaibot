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
