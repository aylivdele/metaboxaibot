import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type {
  Dialog,
  HeyGenVoice,
  Message,
  Model,
  ModelSettingDef,
  UserState,
  UserUpload,
} from "../types.js";

// ── Custom slider ─────────────────────────────────────────────────────────────

interface CustomSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function CustomSlider({ min, max, step, value, onChange }: CustomSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const percent = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  const valueFromX = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    return Math.max(min, Math.min(max, +snapped.toFixed(10)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFromX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    onChange(valueFromX(e.clientX));
  };

  return (
    <div
      ref={containerRef}
      className="custom-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div className="custom-slider__track">
        <div className="custom-slider__fill" style={{ width: `${percent * 100}%` }} />
      </div>
      <div className="custom-slider__thumb" style={{ left: `${percent * 100}%` }} />
    </div>
  );
}

// ── HeyGenVoicePicker ─────────────────────────────────────────────────────────

interface HeyGenVoicePickerProps {
  /** Currently selected official voice_id (empty string = none) */
  voiceId: string;
  /** Currently selected user upload URL stored as voice_url (empty string = none) */
  voiceUrl: string;
  /** Called when user picks an official voice: sets voice_id, clears voice_url */
  onChange: (key: string, value: unknown) => void;
}

function HeyGenVoicePicker({ voiceId, voiceUrl, onChange }: HeyGenVoicePickerProps) {
  const { t } = useI18n();
  // "official" | "uploads"
  const [tab, setTab] = useState<"official" | "uploads">(voiceUrl ? "uploads" : "official");

  // Official voices state
  const [voices, setVoices] = useState<HeyGenVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  // User uploads state
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (tab === "official" && voices.length === 0) {
      setVoicesLoading(true);
      api.heygenVoices
        .list()
        .then(setVoices)
        .catch(() => setVoices([]))
        .finally(() => setVoicesLoading(false));
    }
    if (tab === "uploads") {
      setUploadsLoading(true);
      api.uploads
        .list("voice")
        .then(setUploads)
        .catch(() => setUploads([]))
        .finally(() => setUploadsLoading(false));
    }
  }, [tab, voices.length]);

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlayingId(null);
  };

  const playPreview = (id: string, url: string) => {
    if (playingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(id);
    audio.play().catch(() => void 0);
    audio.onended = () => setPlayingId(null);
  };

  const selectOfficial = (id: string) => {
    onChange("voice_id", id);
    onChange("voice_url", "");
  };

  const selectUpload = (url: string) => {
    onChange("voice_url", url);
    onChange("voice_id", "");
  };

  const languages = [
    "all",
    ...Array.from(new Set(voices.map((v) => v.language).filter(Boolean))).sort(),
  ];
  const filteredVoices = voices.filter(
    (v) =>
      (langFilter === "all" || v.language === langFilter) &&
      (genderFilter === "all" || v.gender === genderFilter),
  );

  return (
    <div className="voice-picker">
      {/* Tab toggle */}
      <div className="voice-picker__tabs">
        <button
          className={`voice-picker__tab${tab === "official" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("official")}
        >
          {t("uploads.officialVoices")}
        </button>
        <button
          className={`voice-picker__tab${tab === "uploads" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("uploads")}
        >
          {t("uploads.myVoices")}
        </button>
      </div>

      {/* Official voices */}
      {tab === "official" &&
        (voicesLoading ? (
          <div className="voice-picker__loading">Загрузка голосов…</div>
        ) : (
          <>
            <div className="voice-picker__filters">
              <select
                className="voice-picker__filter-select"
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
              >
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l === "all" ? "Все языки" : l}
                  </option>
                ))}
              </select>
              <div className="voice-picker__gender-btns">
                {(["all", "male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    className={`voice-picker__gender-btn${genderFilter === g ? " voice-picker__gender-btn--active" : ""}`}
                    onClick={() => setGenderFilter(g)}
                  >
                    {g === "all" ? "Все" : g === "male" ? "М" : "Ж"}
                  </button>
                ))}
              </div>
            </div>
            <div className="voice-picker__list">
              {filteredVoices.map((voice) => (
                <div
                  key={voice.voice_id}
                  className={`voice-picker__item${voiceId === voice.voice_id && !voiceUrl ? " voice-picker__item--selected" : ""}`}
                  onClick={() => selectOfficial(voice.voice_id)}
                >
                  <div className="voice-picker__item-info">
                    <span className="voice-picker__item-name">{voice.name}</span>
                    <span className="voice-picker__item-meta">
                      {voice.language}
                      {voice.gender
                        ? ` · ${voice.gender === "male" ? "М" : voice.gender === "female" ? "Ж" : voice.gender}`
                        : ""}
                    </span>
                  </div>
                  {voice.preview_audio && (
                    <button
                      className={`voice-picker__play-btn${playingId === voice.voice_id ? " voice-picker__play-btn--playing" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        playPreview(voice.voice_id, voice.preview_audio!);
                      }}
                      title="Прослушать"
                    >
                      {playingId === voice.voice_id ? "⏹" : "▶"}
                    </button>
                  )}
                </div>
              ))}
              {filteredVoices.length === 0 && (
                <div className="voice-picker__empty">Голоса не найдены</div>
              )}
            </div>
          </>
        ))}

      {/* My recordings */}
      {tab === "uploads" &&
        (uploadsLoading ? (
          <div className="voice-picker__loading">Загрузка…</div>
        ) : uploads.length === 0 ? (
          <div className="voice-picker__empty">{t("uploads.empty")}</div>
        ) : (
          <div className="voice-picker__list">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className={`voice-picker__item${voiceUrl === upload.url ? " voice-picker__item--selected" : ""}`}
                onClick={() => selectUpload(upload.url)}
              >
                <div className="voice-picker__item-info">
                  <span className="voice-picker__item-name">{upload.name}</span>
                  <span className="voice-picker__item-meta">
                    {new Date(upload.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className={`voice-picker__play-btn${playingId === upload.id ? " voice-picker__play-btn--playing" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    playPreview(upload.id, upload.url);
                  }}
                  title="Прослушать"
                >
                  {playingId === upload.id ? "⏹" : "▶"}
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  settings: ModelSettingDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function SettingsPanel({ settings, values, onChange }: SettingsPanelProps) {
  if (!settings || settings.length === 0) return null;
  return (
    <div className="settings-panel">
      {settings.map((def) => {
        const val = values[def.key] !== undefined ? values[def.key] : def.default;
        return (
          <div key={def.key} className="settings-panel__row">
            <span className="settings-panel__label">{def.label}</span>
            {def.description && <span className="settings-panel__desc">{def.description}</span>}
            {def.type === "select" && (
              <div className="image-settings-ratios">
                {def.options!.map((opt) => (
                  <button
                    key={String(opt.value)}
                    className={`ratio-btn${val === opt.value ? " ratio-btn--active" : ""}`}
                    onClick={() => onChange(def.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {def.type === "slider" && (
              <div className="settings-panel__slider-row">
                <CustomSlider
                  min={def.min ?? 0}
                  max={def.max ?? 100}
                  step={def.step ?? 1}
                  value={Number(val ?? def.min ?? 0)}
                  onChange={(v) => onChange(def.key, v)}
                />
                <span className="settings-panel__slider-value">{Number(val ?? def.min ?? 0)}</span>
              </div>
            )}
            {def.type === "toggle" && (
              <div className="settings-panel__toggle-row">
                <label className="settings-panel__toggle-label">
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => onChange(def.key, e.target.checked)}
                  />
                  <span className="settings-panel__toggle-track" />
                </label>
              </div>
            )}
            {def.type === "text" && (
              <textarea
                className="settings-panel__textarea"
                value={String(val ?? "")}
                rows={2}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            )}
            {def.type === "number" && (
              <input
                type="number"
                className="settings-panel__number"
                min={def.min}
                max={def.max}
                placeholder="auto"
                value={val !== null && val !== undefined ? String(val) : ""}
                onChange={(e) => onChange(def.key, e.target.value ? Number(e.target.value) : null)}
              />
            )}
            {def.type === "color" && (
              <div className="settings-panel__color-row">
                <input
                  type="color"
                  className="settings-panel__color-input"
                  value={String(val ?? "#FFFFFF")}
                  onChange={(e) => onChange(def.key, e.target.value)}
                />
                <span className="settings-panel__color-hex">{String(val ?? "#FFFFFF")}</span>
              </div>
            )}
            {def.type === "voice-picker" && (
              <HeyGenVoicePicker
                voiceId={String(values["voice_id"] ?? "")}
                voiceUrl={String(values["voice_url"] ?? "")}
                onChange={onChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Image settings view (section=design) ────────────────────────────────────

/** Groups flat model list by familyId. Returns { familyId → Model[] } and standalone models. */
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

function modelCostLabel(m: Model, perReq: string, perMP: string): string | null {
  if (m.tokenCostPerMPixel > 0) return `${m.tokenCostPerMPixel.toFixed(2)} ✦${perMP}`;
  if (m.tokenCostPerRequest > 0) return `${m.tokenCostPerRequest.toFixed(2)} ✦${perReq}`;
  return null;
}

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

  // Which member of this family is currently being previewed in the card
  const belongsHere = members.some((m) => m.id === activeModelId);
  const defaultMember = members[0];
  const [localId, setLocalId] = useState<string>(
    belongsHere ? activeModelId : (defaultMember?.id ?? ""),
  );

  // Keep in sync when global activeModelId changes to something in this family
  useEffect(() => {
    if (members.some((m) => m.id === activeModelId)) {
      setLocalId(activeModelId);
    }
  }, [activeModelId, members]);

  const selected = members.find((m) => m.id === localId) ?? defaultMember;
  if (!selected) return null;

  const isGloballyActive = activeModelId === localId;

  // Unique version labels in order
  const versions = [...new Set(members.map((m) => m.versionLabel).filter(Boolean))] as string[];
  const currentVersion = selected.versionLabel ?? null;

  // Variants for the currently selected version
  const variantsForVersion = currentVersion
    ? members.filter((m) => m.versionLabel === currentVersion)
    : members;
  const hasVariants = variantsForVersion.length > 1;

  const [activating, setActivating] = useState(false);

  const selectMember = (modelId: string) => {
    setLocalId(modelId);
  };

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
  const cost = modelCostLabel(selected, t("manage.price.perReq"), t("manage.price.perMPixel"));

  // Family name: take from first member's name prefix or use a generic label
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

      {/* Version selector */}
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

      {/* Variant selector */}
      {hasVariants && (
        <div className="family-card__row">
          <span className="family-card__row-label">{t("imageSettings.variant")}</span>
          <div className="image-settings-ratios">
            {variantsForVersion.map((m) => (
              <button
                key={m.id}
                className={`ratio-btn${localId === m.id ? " ratio-btn--active" : ""}${m.variantLabel?.toLowerCase().includes("vector") ? " ratio-btn--svg" : ""}`}
                onClick={() => selectMember(m.id)}
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
          disabled={activating}
        >
          {activating ? t("imageSettings.activating") : t("imageSettings.activate")}
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

interface StandaloneCardProps {
  model: Model;
  isActive: boolean;
  isPendingLocal: boolean;
  savedId: string | null;
  allModelSettings: Record<string, Record<string, unknown>>;
  onSelect: () => void;
  onActivate: (modelId: string) => Promise<void>;
  onSettingChange: (key: string, value: unknown) => void;
  onReset: (modelId: string) => void;
}

function StandaloneCard({
  model,
  isActive,
  isPendingLocal,
  savedId,
  allModelSettings,
  onSelect,
  onActivate,
  onSettingChange,
  onReset,
}: StandaloneCardProps) {
  const { t } = useI18n();
  const [activating, setActivating] = useState(false);
  const cost = modelCostLabel(model, t("manage.price.perReq"), t("manage.price.perMPixel"));

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate(model.id);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      className={`family-card${isActive ? " family-card--active" : ""}`}
      onClick={() => !isPendingLocal && onSelect()}
      style={{ cursor: isPendingLocal ? "default" : "pointer" }}
    >
      <div className="family-card__header">
        <span className="family-card__name">{model.name}</span>
        {isActive && <span className="family-card__badge">{t("imageSettings.active")}</span>}
      </div>
      {model.description && <p className="family-card__desc">{model.description}</p>}
      {isPendingLocal && model.settings.length > 0 && (
        <div className="family-card__row family-card__row--settings">
          <SettingsPanel
            settings={model.settings}
            values={allModelSettings[model.id] ?? {}}
            onChange={onSettingChange}
          />
        </div>
      )}
      {isPendingLocal && (
        <div className="family-card__btn-row">
          <button
            className="family-card__activate-btn"
            onClick={(e) => {
              e.stopPropagation();
              void handleActivate();
            }}
            disabled={activating}
          >
            {activating ? t("imageSettings.activating") : t("imageSettings.activate")}
          </button>
          {model.settings.length > 0 && (
            <button
              className="family-card__reset-btn"
              onClick={(e) => {
                e.stopPropagation();
                onReset(model.id);
              }}
              title={t("imageSettings.resetTitle")}
            >
              {t("imageSettings.reset")}
            </button>
          )}
        </div>
      )}
      {cost && <div className="family-card__cost">{cost}</div>}
      {savedId === model.id && (
        <div className="model-settings-saved">{t("imageSettings.saved")}</div>
      )}
    </div>
  );
}

// ── Picker helpers ────────────────────────────────────────────────────────────

interface PickerOption {
  id: string; // "family__<familyId>" | "standalone__<modelId>"
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

// ── Unified MediaSettingsView ─────────────────────────────────────────────────

type MediaSection = "design" | "video" | "audio";

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

function MediaSettingsView({ section }: { section: MediaSection }) {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [pendingStandaloneId, setPendingStandaloneId] = useState<string>("");
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
        setPendingStandaloneId(initial);
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

  // Resolve which card to render
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
        <div className="model-selector-wrap">
          <select
            className="model-selector-select"
            value={selectedPickerId}
            onChange={(e) => setSelectedPickerId(e.target.value)}
          >
            {pickerOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
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
          isPendingLocal={pendingStandaloneId === standaloneModel.id}
          savedId={savedId}
          allModelSettings={allModelSettings}
          onSelect={() => setPendingStandaloneId(standaloneModel.id)}
          onActivate={handleModelActivate}
          onSettingChange={(key, val) => handleSettingChange(standaloneModel.id, key, val)}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

// ── UploadsView ───────────────────────────────────────────────────────────────

function UploadsView() {
  const { t } = useI18n();
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api.uploads
      .list()
      .then(setUploads)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlayingId(null);
  };

  const playPreview = (id: string, url: string) => {
    if (playingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(id);
    audio.play().catch(() => void 0);
    audio.onended = () => setPlayingId(null);
  };

  const startEdit = (upload: UserUpload) => {
    setEditingId(upload.id);
    setEditName(upload.name);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const updated = await api.uploads.rename(id, editName.trim()).catch(() => null);
    if (updated) {
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, name: editName.trim() } : u)));
    }
    setEditingId(null);
  };

  const deleteUpload = async (id: string) => {
    if (!confirm(t("uploads.confirmDelete"))) return;
    await api.uploads.delete(id).catch(console.error);
    setUploads((prev) => prev.filter((u) => u.id !== id));
    if (playingId === id) stopAudio();
  };

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("uploads.title")}</h2>
        <p className="page-subtitle">{t("uploads.subtitle")}</p>
      </div>
      {uploads.length === 0 ? (
        <p className="uploads-empty">{t("uploads.empty")}</p>
      ) : (
        <div className="uploads-list">
          {uploads.map((upload) => (
            <div key={upload.id} className="uploads-item">
              <button
                className={`voice-picker__play-btn${playingId === upload.id ? " voice-picker__play-btn--playing" : ""}`}
                onClick={() => playPreview(upload.id, upload.url)}
                title="Прослушать"
              >
                {playingId === upload.id ? "⏹" : "▶"}
              </button>

              <div className="uploads-item__info">
                {editingId === upload.id ? (
                  <input
                    className="uploads-item__name-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEdit(upload.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => void saveEdit(upload.id)}
                  />
                ) : (
                  <span className="uploads-item__name" onClick={() => startEdit(upload)}>
                    {upload.name}
                  </span>
                )}
                <span className="uploads-item__meta">
                  {upload.type} · {new Date(upload.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="uploads-item__actions">
                <button
                  className="uploads-item__btn uploads-item__btn--rename"
                  onClick={() => startEdit(upload)}
                  title={t("uploads.rename")}
                >
                  ✏
                </button>
                <button
                  className="uploads-item__btn uploads-item__btn--delete"
                  onClick={() => void deleteUpload(upload.id)}
                  title={t("uploads.delete")}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dispatcher with tab bar ───────────────────────────────────────────────────

type ManageTab = "gpt" | "design" | "video" | "audio" | "uploads";

export function ManagementPage({ initialSection }: { initialSection?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ManageTab>(
    initialSection === "design"
      ? "design"
      : initialSection === "video"
        ? "video"
        : initialSection === "audio"
          ? "audio"
          : "gpt",
  );

  return (
    <div className="manage-root">
      <div className="manage-tabs">
        {(["gpt", "design", "video", "audio", "uploads"] as ManageTab[]).map((s) => (
          <button
            key={s}
            className={`manage-tab${tab === s ? " manage-tab--active" : ""}`}
            onClick={() => setTab(s)}
          >
            {t(`manage.tab.${s}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
      <div className="manage-content">
        {tab === "gpt" && <GptManagementView />}
        {tab === "design" && <MediaSettingsView section="design" />}
        {tab === "video" && <MediaSettingsView section="video" />}
        {tab === "audio" && <MediaSettingsView section="audio" />}
        {tab === "uploads" && <UploadsView />}
      </div>
    </div>
  );
}

// ── Chat history view ────────────────────────────────────────────────────────

function ChatHistory({ dialog, onBack }: { dialog: Dialog; onBack: () => void }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    api.dialogs
      .messages(dialog.id)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dialog.id]);

  // Scroll container to bottom after messages render
  useEffect(() => {
    if (!loading && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [loading, messages]);

  return (
    <div className="chat-view">
      <div className="chat-view__header">
        <button className="chat-back-btn" onClick={onBack}>
          {t("manage.back")}
        </button>
        <div className="chat-view__title">
          <div className="chat-view__name">{dialog.title ?? dialog.modelId}</div>
          <div className="chat-view__model">{dialog.modelId}</div>
        </div>
      </div>

      <div className="chat-messages" ref={containerRef}>
        {loading && <div className="chat-empty">{t("common.loading")}</div>}
        {!loading && messages.length === 0 && (
          <div className="chat-empty">{t("manage.noMessages")}</div>
        )}
        {!loading &&
          messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
              {msg.mediaUrl && msg.mediaType === "image" && (
                <img className="chat-bubble__image" src={msg.mediaUrl} alt="" loading="lazy" />
              )}
              {msg.content && <div className="chat-bubble__text">{msg.content}</div>}
              <div className="chat-bubble__time">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ModelFilter = "all" | "images" | "voice" | "web";

function formatModelPrice(
  m: Model,
  perReqLabel: string,
  perMsgLabel: string,
  perMPixelLabel: string,
): string {
  if (m.isLLM) {
    return `~${m.tokenCostApproxMsg.toFixed(2)} ✦${perMsgLabel}`;
  }
  if (m.tokenCostPerMPixel > 0) {
    return `${m.tokenCostPerMPixel.toFixed(2)} ✦${perMPixelLabel}`;
  }
  if (m.tokenCostPerRequest > 0) {
    return `${m.tokenCostPerRequest.toFixed(2)} ✦${perReqLabel}`;
  }
  return m.provider;
}

// ── GPT dialogs view ─────────────────────────────────────────────────────────

function GptManagementView() {
  const { t } = useI18n();
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [state, setState] = useState<UserState | null>(null);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewingDialog, setViewingDialog] = useState<Dialog | null>(null);
  const [filter, setFilter] = useState<ModelFilter>("all");
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ds, ms, st, ms2] = await Promise.all([
      api.dialogs.list("gpt"),
      api.models.list("gpt"),
      api.state.get(),
      api.modelSettings.get(),
    ]);
    setDialogs(ds);
    setModels(ms);
    setState(st);
    setAllModelSettings(ms2);
    setLoading(false);
  }, []);

  const handleSettingChange = (modelId: string, key: string, value: unknown) => {
    setAllModelSettings((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? {}), [key]: value },
    }));
    const dKey = `${modelId}__${key}`;
    clearTimeout(debounceRef.current[dKey]);
    debounceRef.current[dKey] = setTimeout(() => {
      void api.modelSettings.set(modelId, { [key]: value });
    }, 800);
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, [loadData]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this dialog?")) return;
    await api.dialogs.delete(id);
    setDialogs((ds) => ds.filter((d) => d.id !== id));
    if (state?.gptDialogId === id) {
      setState((s) => (s ? { ...s, gptDialogId: null } : s));
    }
    if (viewingDialog?.id === id) setViewingDialog(null);
  };

  const handleActivate = async (dialog: Dialog) => {
    await api.dialogs.activate(dialog.id);
    setState((s) => (s ? { ...s, gptDialogId: dialog.id, gptModelId: dialog.modelId } : s));
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    await api.dialogs.rename(id, renameValue.trim());
    setDialogs((ds) => ds.map((d) => (d.id === id ? { ...d, title: renameValue.trim() } : d)));
    setRenamingId(null);
    setRenameValue("");
  };

  const handleCreateDialog = async (modelId: string) => {
    setCreating(true);
    try {
      const dialog = await api.dialogs.create("gpt", modelId);
      await api.dialogs.activate(dialog.id);
      setState((s) => (s ? { ...s, gptDialogId: dialog.id, gptModelId: modelId } : s));
      setDialogs((ds) => [dialog, ...ds]);
      setIsCreating(false);
    } finally {
      setCreating(false);
    }
  };

  // Show history view
  if (viewingDialog) {
    return <ChatHistory dialog={viewingDialog} onBack={() => setViewingDialog(null)} />;
  }

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("manage.title")}</h2>
        <p className="page-subtitle">{t("manage.subtitle")}</p>
      </div>

      {isCreating ? (
        <div className="model-picker">
          <div className="model-picker__header">
            <span>{t("manage.chooseModel")}</span>
            <button className="action-btn" onClick={() => setIsCreating(false)}>
              ✕
            </button>
          </div>

          <div className="model-filter-bar">
            {(["all", "images", "voice", "web"] as ModelFilter[]).map((f) => (
              <button
                key={f}
                className={`model-filter-btn${filter === f ? " model-filter-btn--active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {t(`manage.filter.${f}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          <div className="model-legend">
            <span>{t("manage.legend.images")}</span>
            <span>{t("manage.legend.voice")}</span>
            <span>{t("manage.legend.web")}</span>
          </div>

          {models.filter((m) => {
            if (filter === "images") return m.supportsImages;
            if (filter === "voice") return m.supportsVoice;
            if (filter === "web") return m.supportsWeb;
            return true;
          }).length === 0 ? (
            <div className="empty-state">{t("manage.noModels")}</div>
          ) : (
            models
              .filter((m) => {
                if (filter === "images") return m.supportsImages;
                if (filter === "voice") return m.supportsVoice;
                if (filter === "web") return m.supportsWeb;
                return true;
              })
              .map((m) => (
                <div
                  key={m.id}
                  className={`model-item${creating ? " model-item--disabled" : ""}`}
                  onClick={() => !creating && void handleCreateDialog(m.id)}
                >
                  <div className="model-item__name">{m.name}</div>
                  {m.description && <div className="model-item__desc">{m.description}</div>}
                  <div className="model-item__meta">
                    {formatModelPrice(
                      m,
                      t("manage.price.perReq"),
                      t("manage.price.perMsg"),
                      t("manage.price.perMPixel"),
                    )}{" "}
                    · {m.provider}
                    {m.supportsImages && " · 🖼"}
                    {m.supportsVoice && " · 🎙"}
                    {m.supportsWeb && " · 🌐"}
                  </div>
                </div>
              ))
          )}
        </div>
      ) : (
        <div className="dialog-list">
          <button className="new-dialog-btn" onClick={() => setIsCreating(true)}>
            {t("manage.newDialog")}
          </button>

          {(() => {
            const activeModel = state?.gptModelId
              ? models.find((m) => m.id === state.gptModelId)
              : undefined;
            if (!activeModel || activeModel.settings.length === 0) return null;
            return (
              <div className="model-settings-panel">
                <div className="model-settings-panel__desc">{activeModel.name}</div>
                <SettingsPanel
                  settings={activeModel.settings}
                  values={allModelSettings[activeModel.id] ?? {}}
                  onChange={(key, val) => handleSettingChange(activeModel.id, key, val)}
                />
              </div>
            );
          })()}

          {dialogs.length === 0 ? (
            <div className="empty-state">{t("manage.noDialogs")}</div>
          ) : (
            dialogs.map((d) => (
              <div
                key={d.id}
                className={`dialog-item${state?.gptDialogId === d.id ? " dialog-item--active" : ""}`}
              >
                {renamingId === d.id ? (
                  <div className="dialog-item__rename">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRename(d.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                    />
                    <button
                      className="action-btn action-btn--primary"
                      onClick={() => void handleRename(d.id)}
                    >
                      ✓
                    </button>
                    <button className="action-btn" onClick={() => setRenamingId(null)}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="dialog-item__info"
                      onClick={() => setViewingDialog(d)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="dialog-item__title">{d.title ?? d.modelId}</div>
                      <div className="dialog-item__meta">
                        {d.modelId} · {new Date(d.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="dialog-item__actions">
                      {state?.gptDialogId !== d.id && (
                        <button
                          className="action-btn action-btn--primary"
                          onClick={() => void handleActivate(d)}
                          title={t("manage.activate")}
                        >
                          ▶
                        </button>
                      )}
                      <button
                        className="action-btn"
                        onClick={() => setViewingDialog(d)}
                        title={t("manage.history")}
                      >
                        💬
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => {
                          setRenamingId(d.id);
                          setRenameValue(d.title ?? "");
                        }}
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn action-btn--danger"
                        onClick={() => void handleDelete(d.id)}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
