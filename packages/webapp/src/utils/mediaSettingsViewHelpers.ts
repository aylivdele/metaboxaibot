import type { useI18n } from "../i18n";
import type { Model } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function groupByFamily(models: Model[]): {
  families: Map<string, Model[]>;
  standalone: Model[];
} {
  const families = new Map<string, Model[]>();
  const standalone: Model[] = [];
  for (const m of models) {
    if (m.familyId) {
      const arr = families.get(m.familyId) ?? [];
      arr.push(m);
      families.set(m.familyId, arr);
    } else {
      standalone.push(m);
    }
  }
  return { families, standalone };
}

/**
 * When a costMatrix dimension setting changes to a value that creates an invalid
 * combination, returns corrections for the other dims to restore validity.
 * Returns null when the combination is valid or the model has no costMatrix.
 */
export function autoCorrectForCostMatrix(
  model: Model,
  changedKey: string,
  changedValue: unknown,
  currentValues: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!model.costMatrix) return null;
  const { dims, table } = model.costMatrix;
  if (!dims.includes(changedKey)) return null;

  const newValues = { ...currentValues, [changedKey]: changedValue };
  const key = dims.map((d) => String(newValues[d] ?? "")).join("__");
  if (key in table) return null;

  const changedIndex = dims.indexOf(changedKey);
  const changedStr = String(changedValue);

  for (const tableKey of Object.keys(table)) {
    const parts = tableKey.split("__");
    if (parts[changedIndex] === changedStr) {
      const corrections: Record<string, unknown> = {};
      for (let i = 0; i < dims.length; i++) {
        if (i !== changedIndex) corrections[dims[i]] = parts[i];
      }
      return corrections;
    }
  }
  return null;
}

interface PickerOption {
  id: string;
  label: string;
}

export function buildPickerOptions(
  models: Model[],
  modelTranslations: Record<string, { name?: string }>,
): PickerOption[] {
  const { families, standalone } = groupByFamily(models);
  const opts: PickerOption[] = [];
  for (const [fid, members] of families.entries()) {
    const familyName = members[0]?.familyName ?? fid.charAt(0).toUpperCase() + fid.slice(1);
    opts.push({ id: `family__${fid}`, label: familyName });
  }
  for (const m of standalone) {
    opts.push({ id: `standalone__${m.id}`, label: modelTranslations[m.id]?.name ?? m.name });
  }
  return opts;
}

export function getPickerIdForModel(modelId: string, models: Model[]): string {
  const m = models.find((x) => x.id === modelId);
  if (!m) {
    const first = models[0];
    if (!first) return "";
    return first.familyId ? `family__${first.familyId}` : `standalone__${first.id}`;
  }
  return m.familyId ? `family__${m.familyId}` : `standalone__${m.id}`;
}

/** Matches the backend's computeVideoTokens resolution map. */
const VIDEO_RESOLUTION: Record<string, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [720, 720],
  "4:3": [960, 720],
  "3:4": [720, 960],
};

function resolveAddons(m: Model, values: Record<string, unknown>): number {
  if (!m.tokenCostAddons?.length) return 0;
  return m.tokenCostAddons.reduce((sum, addon) => {
    const val = String(values[addon.settingKey] ?? "");
    return sum + (addon.map[val] ?? 0);
  }, 0);
}

export function modelCostLabel(
  m: Model,
  values: Record<string, unknown>,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  if (m.isLLM) {
    return `~${m.tokenCostApproxMsg.toFixed(2)} ✦${t("manage.price.perMsg")}`;
  }
  if (m.tokenCostPerMPixel > 0) {
    return `${m.tokenCostPerMPixel.toFixed(2)} ✦${t("manage.price.perMPixel")}`;
  }
  if (m.tokenCostPerMVideoToken > 0) {
    const aspectRatio = String(
      values["aspect_ratio"] ?? m.settings.find((s) => s.key === "aspect_ratio")?.default ?? "16:9",
    );
    const duration = Number(
      values["duration"] ?? m.settings.find((s) => s.key === "duration")?.default ?? 5,
    );
    const [w, h] = VIDEO_RESOLUTION[aspectRatio] ?? [1280, 720];
    const fps = m.videoFps || 24;
    const videoTokens = (w * h * fps * duration) / 1024;
    const cost = (m.tokenCostPerMVideoToken * videoTokens) / 1_000_000;
    return `~${cost.toFixed(2)} ✦${t("manage.price.perReq")}`;
  }
  if (m.tokenCostPerKChar > 0) {
    let costPerKChar = m.tokenCostPerKChar;
    if (m.tokenCostVariants) {
      const vKey = String(
        values[m.tokenCostVariants.settingKey] ??
          m.settings.find((s) => s.key === m.tokenCostVariants!.settingKey)?.default ??
          "",
      );
      costPerKChar = m.tokenCostVariants.map[vKey] ?? costPerKChar;
    }
    return `${costPerKChar.toFixed(2)} ✦${t("manage.price.perKChar")}`;
  }
  if (m.tokenCostPerSecond > 0) {
    const duration = Number(
      values["duration"] ?? m.settings.find((s) => s.key === "duration")?.default ?? 5,
    );
    let perSecond = m.tokenCostPerSecond;
    if (m.tokenCostVariants) {
      const vKey = String(
        values[m.tokenCostVariants.settingKey] ??
          m.settings.find((s) => s.key === m.tokenCostVariants!.settingKey)?.default ??
          "",
      );
      perSecond = m.tokenCostVariants.map[vKey] ?? perSecond;
    }
    const cost = perSecond * duration + resolveAddons(m, values);
    return `~${cost.toFixed(2)} ✦${t("manage.price.perReq")}`;
  }
  if (m.tokenCostPerRequest > 0) {
    // Multi-dimensional pricing (e.g. quality × size)
    if (m.costMatrix) {
      const key = m.costMatrix.dims.map((dim) => String(values[dim] ?? "")).join("__");
      const cost = m.costMatrix.table[key] ?? m.tokenCostPerRequest;
      return `${cost.toFixed(2)} ✦${t("manage.price.perReq")}`;
    }
    // Single-setting variant pricing + optional addons
    let base = m.tokenCostPerRequest;
    if (m.tokenCostVariants) {
      const vKey = String(
        values[m.tokenCostVariants.settingKey] ??
          m.settings.find((s) => s.key === m.tokenCostVariants!.settingKey)?.default ??
          "",
      );
      base = m.tokenCostVariants.map[vKey] ?? base;
    }
    const cost = base + resolveAddons(m, values);
    return `${cost.toFixed(2)} ✦${t("manage.price.perReq")}`;
  }
  return null;
}

export function isActiveSection(section: string, state?: string) {
  switch (section) {
    case "gpt":
      return state === "GPT_ACTIVE";
    case "design":
      return state === "DESIGN_ACTIVE";
    case "video":
      return state === "VIDEO_ACTIVE";
    case "audio":
      return state === "AUDIO_ACTIVE";
  }
  return false;
}
