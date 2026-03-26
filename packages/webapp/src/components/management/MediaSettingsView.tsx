import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { Model, UserState } from "../../types.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { StyledSelect } from "./StyledSelect.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByFamily(models: Model[]): {
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

/** Matches the backend's computeVideoTokens resolution map. */
const VIDEO_RESOLUTION: Record<string, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [720, 720],
  "4:3": [960, 720],
  "3:4": [720, 960],
};

function modelCostLabel(
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
  if (m.tokenCostPerSecond > 0) {
    const duration = Number(
      values["duration"] ?? m.settings.find((s) => s.key === "duration")?.default ?? 5,
    );
    const cost = m.tokenCostPerSecond * duration;
    return `~${cost.toFixed(2)} ✦${t("manage.price.perReq")}`;
  }
  if (m.tokenCostPerRequest > 0) {
    return `${m.tokenCostPerRequest.toFixed(2)} ✦${t("manage.price.perReq")}`;
  }
  return null;
}

interface PickerOption {
  id: string;
  label: string;
}

function buildPickerOptions(models: Model[]): PickerOption[] {
  const { families, standalone } = groupByFamily(models);
  const opts: PickerOption[] = [];
  for (const [fid] of families.entries()) {
    opts.push({ id: `family__${fid}`, label: fid.charAt(0).toUpperCase() + fid.slice(1) });
  }
  for (const m of standalone) {
    opts.push({ id: `standalone__${m.id}`, label: m.name });
  }
  return opts;
}

function getPickerIdForModel(modelId: string, models: Model[]): string {
  const m = models.find((x) => x.id === modelId);
  if (!m) {
    const first = models[0];
    if (!first) return "";
    return first.familyId ? `family__${first.familyId}` : `standalone__${first.id}`;
  }
  return m.familyId ? `family__${m.familyId}` : `standalone__${m.id}`;
}

// ── FamilyCard ────────────────────────────────────────────────────────────────

interface FamilyCardProps {
  familyId: string;
  members: Model[];
  activeModelId: string;
  savedId: string | null;
  allModelSettings: Record<string, Record<string, unknown>>;
  onModelActivate: (modelId: string) => Promise<void>;
  onSettingChange: (modelId: string, key: string, value: unknown) => void;
  onReset: (modelId: string) => void;
}

function FamilyCard({
  familyId,
  members,
  activeModelId,
  savedId,
  allModelSettings,
  onModelActivate,
  onSettingChange,
  onReset,
}: FamilyCardProps) {
  const { t } = useI18n();

  const belongsHere = members.some((m) => m.id === activeModelId);
  const defaultMember = members[0];
  const [localId, setLocalId] = useState<string>(
    belongsHere ? activeModelId : (defaultMember?.id ?? ""),
  );

  useEffect(() => {
    if (members.some((m) => m.id === activeModelId)) {
      setLocalId(activeModelId);
    }
  }, [activeModelId, members]);

  const selected = members.find((m) => m.id === localId) ?? defaultMember;
  if (!selected) return null;

  const isGloballyActive = activeModelId === localId;

  const versions = [...new Set(members.map((m) => m.versionLabel).filter(Boolean))] as string[];
  const currentVersion = selected.versionLabel ?? null;

  const variantsForVersion = currentVersion
    ? members.filter((m) => m.versionLabel === currentVersion)
    : members;
  const hasVariants = variantsForVersion.length > 1;

  const [activating, setActivating] = useState(false);

  const selectVersion = (version: string) => {
    const sameVariant = members.find(
      (m) => m.versionLabel === version && m.variantLabel === selected.variantLabel,
    );
    const fallback = members.find((m) => m.versionLabel === version);
    const target = sameVariant ?? fallback;
    if (target) setLocalId(target.id);
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onModelActivate(localId);
    } finally {
      setActivating(false);
    }
  };

  const description = selected.descriptionOverride ?? selected.description;
  const currentValues = allModelSettings[selected.id] ?? {};
  const cost = modelCostLabel(selected, currentValues, t);
  const familyLabel = familyId.charAt(0).toUpperCase() + familyId.slice(1);

  return (
    <div className={`family-card${isGloballyActive ? " family-card--active" : ""}`}>
      <div className="family-card__header">
        <span className="family-card__name">{familyLabel}</span>
        {isGloballyActive && (
          <span className="family-card__badge">{t("imageSettings.active")}</span>
        )}
      </div>

      {description && <p className="family-card__desc">{description}</p>}

      {versions.length > 1 && (
        <div className="family-card__row">
          <span className="family-card__row-label">{t("imageSettings.version")}</span>
          <div className="image-settings-ratios">
            {versions.map((v) => (
              <button
                key={v}
                className={`ratio-btn${currentVersion === v ? " ratio-btn--active" : ""}`}
                onClick={() => selectVersion(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasVariants && (
        <div className="family-card__row">
          <span className="family-card__row-label">{t("imageSettings.variant")}</span>
          <div className="image-settings-ratios">
            {variantsForVersion.map((m) => (
              <button
                key={m.id}
                className={`ratio-btn${localId === m.id ? " ratio-btn--active" : ""}${m.variantLabel?.toLowerCase().includes("vector") ? " ratio-btn--svg" : ""}`}
                onClick={() => setLocalId(m.id)}
              >
                {m.variantLabel}
                {m.variantLabel?.toLowerCase().includes("vector") && " 📐"}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected.settings.length > 0 && (
        <div className="family-card__row family-card__row--settings">
          <SettingsPanel
            settings={selected.settings}
            values={allModelSettings[selected.id] ?? {}}
            onChange={(key, val) => onSettingChange(selected.id, key, val)}
          />
        </div>
      )}

      <div className="family-card__btn-row">
        <button
          className="family-card__activate-btn"
          onClick={() => void handleActivate()}
          disabled={activating || isGloballyActive}
        >
          {activating
            ? t("imageSettings.activating")
            : isGloballyActive
              ? t("imageSettings.activated")
              : t("imageSettings.activate")}
        </button>
        {selected.settings.length > 0 && (
          <button
            className="family-card__reset-btn"
            onClick={() => onReset(selected.id)}
            title={t("imageSettings.resetTitle")}
          >
            {t("imageSettings.reset")}
          </button>
        )}
      </div>

      {cost && <div className="family-card__cost">{cost}</div>}
      {savedId === selected.id && (
        <div className="model-settings-saved">{t("imageSettings.saved")}</div>
      )}
    </div>
  );
}

// ── StandaloneCard ────────────────────────────────────────────────────────────

interface StandaloneCardProps {
  model: Model;
  isActive: boolean;
  savedId: string | null;
  allModelSettings: Record<string, Record<string, unknown>>;
  onActivate: (modelId: string) => Promise<void>;
  onSettingChange: (key: string, value: unknown) => void;
  onReset: (modelId: string) => void;
}

function StandaloneCard({
  model,
  isActive,
  savedId,
  allModelSettings,
  onActivate,
  onSettingChange,
  onReset,
}: StandaloneCardProps) {
  const { t } = useI18n();
  const [activating, setActivating] = useState(false);
  const cost = modelCostLabel(model, allModelSettings[model.id] ?? {}, t);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate(model.id);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className={`family-card${isActive ? " family-card--active" : ""}`}>
      <div className="family-card__header">
        <span className="family-card__name">{model.name}</span>
        {isActive && <span className="family-card__badge">{t("imageSettings.active")}</span>}
      </div>
      {model.description && <p className="family-card__desc">{model.description}</p>}
      {model.settings.length > 0 && (
        <div className="family-card__row family-card__row--settings">
          <SettingsPanel
            settings={model.settings}
            values={allModelSettings[model.id] ?? {}}
            onChange={onSettingChange}
          />
        </div>
      )}
      <div className="family-card__btn-row">
        <button
          className="family-card__activate-btn"
          onClick={() => void handleActivate()}
          disabled={activating || isActive}
        >
          {activating
            ? t("imageSettings.activating")
            : isActive
              ? t("imageSettings.activated")
              : t("imageSettings.activate")}
        </button>
        {model.settings.length > 0 && (
          <button
            className="family-card__reset-btn"
            onClick={() => onReset(model.id)}
            title={t("imageSettings.resetTitle")}
          >
            {t("imageSettings.reset")}
          </button>
        )}
      </div>
      {cost && <div className="family-card__cost">{cost}</div>}
      {savedId === model.id && (
        <div className="model-settings-saved">{t("imageSettings.saved")}</div>
      )}
    </div>
  );
}

// ── MediaSettingsView ─────────────────────────────────────────────────────────

export type MediaSection = "design" | "video" | "audio";

const SECTION_ACTIVE_KEY: Record<MediaSection, keyof UserState> = {
  design: "designModelId",
  video: "videoModelId",
  audio: "audioModelId",
};

const SECTION_TITLE_KEY: Record<MediaSection, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
  design: "imageSettings.title",
  video: "videoSettings.title",
  audio: "audioSettings.title",
};

const SECTION_SUBTITLE_KEY: Record<MediaSection, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
  design: "imageSettings.subtitle",
  video: "videoSettings.subtitle",
  audio: "audioSettings.subtitle",
};

export function MediaSettingsView({ section }: { section: MediaSection }) {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [selectedPickerId, setSelectedPickerId] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([api.models.list(section), api.state.get(), api.modelSettings.get()])
      .then(([ms, state, ms2]) => {
        setModels(ms);
        setAllModelSettings(ms2);
        const fromSection = (state[SECTION_ACTIVE_KEY[section]] as string | null) ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setActiveModelId(initial);
        setSelectedPickerId(getPickerIdForModel(initial, ms));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [section]);

  const handleModelActivate = async (modelId: string) => {
    setActiveModelId(modelId);
    await api.state.activate(section, modelId);
  };

  const handleSettingChange = (modelId: string, key: string, value: unknown) => {
    setAllModelSettings((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? {}), [key]: value },
    }));
    setSavedId(modelId);
    setTimeout(() => setSavedId((id) => (id === modelId ? null : id)), 1500);
    const dKey = `${modelId}__${key}`;
    clearTimeout(debounceRef.current[dKey]);
    debounceRef.current[dKey] = setTimeout(() => {
      void api.modelSettings.set(modelId, { [key]: value });
    }, 800);
  };

  const handleReset = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return;
    const defaults: Record<string, unknown> = {};
    for (const def of model.settings) {
      defaults[def.key] = def.default ?? null;
    }
    setAllModelSettings((prev) => ({ ...prev, [modelId]: defaults }));
    void api.modelSettings.set(modelId, defaults);
  };

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  const { families, standalone } = groupByFamily(models);
  const pickerOptions = buildPickerOptions(models);

  const [pickerType, pickerId] = selectedPickerId.split("__");
  const familyMembers = pickerType === "family" ? (families.get(pickerId) ?? []) : null;
  const standaloneModel =
    pickerType === "standalone" ? standalone.find((m) => m.id === pickerId) : null;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t(SECTION_TITLE_KEY[section])}</h2>
        <p className="page-subtitle">{t(SECTION_SUBTITLE_KEY[section])}</p>
      </div>

      {pickerOptions.length > 1 && (
        <StyledSelect
          value={selectedPickerId}
          onChange={setSelectedPickerId}
          options={pickerOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
        />
      )}

      {familyMembers && (
        <FamilyCard
          familyId={pickerId}
          members={familyMembers}
          activeModelId={activeModelId}
          savedId={savedId}
          allModelSettings={allModelSettings}
          onModelActivate={handleModelActivate}
          onSettingChange={(modelId, key, val) => handleSettingChange(modelId, key, val)}
          onReset={handleReset}
        />
      )}

      {standaloneModel && (
        <StandaloneCard
          model={standaloneModel}
          isActive={activeModelId === standaloneModel.id}
          savedId={savedId}
          allModelSettings={allModelSettings}
          onActivate={handleModelActivate}
          onSettingChange={(key, val) => handleSettingChange(standaloneModel.id, key, val)}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
