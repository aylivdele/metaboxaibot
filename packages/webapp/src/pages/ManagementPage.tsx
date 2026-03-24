import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { Dialog, Message, Model, ModelSettingDef, UserState } from "../types.js";

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
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={Number(val ?? def.min ?? 0)}
                  onChange={(e) => onChange(def.key, parseFloat(e.target.value))}
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
          </div>
        );
      })}
    </div>
  );
}

// ── Video settings view (section=video) ──────────────────────────────────────

function VideoSettingsView() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([api.models.list("video"), api.state.get(), api.modelSettings.get()])
      .then(([ms, state, ms2]) => {
        setModels(ms);
        setAllModelSettings(ms2);
        const fromSection = state.videoModelId ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setSelectedId(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  const model = models.find((m) => m.id === selectedId);

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("videoSettings.title")}</h2>
        <p className="page-subtitle">{t("videoSettings.subtitle")}</p>
      </div>

      <div className="settings-field">
        <label className="settings-field__label">{t("videoSettings.model")}</label>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            void api.state.patch({ section: "video", sectionModelId: e.target.value });
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {model && (
        <div className="model-settings-panel">
          {model.description && <p className="model-settings-panel__desc">{model.description}</p>}

          {model.settings.length > 0 && (
            <SettingsPanel
              settings={model.settings}
              values={allModelSettings[model.id] ?? {}}
              onChange={(key, val) => handleSettingChange(model.id, key, val)}
            />
          )}

          {savedId === model.id && (
            <div className="model-settings-saved">{t("videoSettings.saved")}</div>
          )}
        </div>
      )}
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
  onModelActivate: (modelId: string) => void;
  onSettingChange: (modelId: string, key: string, value: unknown) => void;
}

function FamilyCard({
  familyId,
  members,
  activeModelId,
  savedId,
  allModelSettings,
  onModelActivate,
  onSettingChange,
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

  const selectMember = (modelId: string) => {
    setLocalId(modelId);
    onModelActivate(modelId);
  };

  const selectVersion = (version: string) => {
    const sameVariant = members.find(
      (m) => m.versionLabel === version && m.variantLabel === selected.variantLabel,
    );
    const fallback = members.find((m) => m.versionLabel === version);
    const target = sameVariant ?? fallback;
    if (target) selectMember(target.id);
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

      {cost && <div className="family-card__cost">{cost}</div>}
      {savedId === selected.id && (
        <div className="model-settings-saved">{t("imageSettings.saved")}</div>
      )}
    </div>
  );
}

function ImageSettingsView() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([api.models.list("design"), api.state.get(), api.modelSettings.get()])
      .then(([ms, state, ms2]) => {
        setModels(ms);
        setAllModelSettings(ms2);
        const fromSection = state.designModelId ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setActiveModelId(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleModelActivate = (modelId: string) => {
    setActiveModelId(modelId);
    void api.state.patch({ section: "design", sectionModelId: modelId });
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

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  const { families, standalone } = groupByFamily(models);

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("imageSettings.title")}</h2>
        <p className="page-subtitle">{t("imageSettings.subtitle")}</p>
      </div>

      {/* Family cards */}
      {[...families.entries()].map(([fid, members]) => (
        <FamilyCard
          key={fid}
          familyId={fid}
          members={members}
          activeModelId={activeModelId}
          savedId={savedId}
          allModelSettings={allModelSettings}
          onModelActivate={handleModelActivate}
          onSettingChange={handleSettingChange}
        />
      ))}

      {/* Standalone models */}
      {standalone.length > 0 && (
        <>
          <div className="family-section-divider">{t("imageSettings.otherModels")}</div>
          {standalone.map((m) => {
            const isActive = activeModelId === m.id;
            const cost = modelCostLabel(m, t("manage.price.perReq"), t("manage.price.perMPixel"));
            return (
              <div
                key={m.id}
                className={`family-card${isActive ? " family-card--active" : ""}`}
                onClick={() => !isActive && handleModelActivate(m.id)}
                style={{ cursor: isActive ? "default" : "pointer" }}
              >
                <div className="family-card__header">
                  <span className="family-card__name">{m.name}</span>
                  {isActive && (
                    <span className="family-card__badge">{t("imageSettings.active")}</span>
                  )}
                </div>
                {m.description && <p className="family-card__desc">{m.description}</p>}
                {isActive && m.settings.length > 0 && (
                  <SettingsPanel
                    settings={m.settings}
                    values={allModelSettings[m.id] ?? {}}
                    onChange={(key, val) => handleSettingChange(m.id, key, val)}
                  />
                )}
                {cost && <div className="family-card__cost">{cost}</div>}
                {savedId === m.id && (
                  <div className="model-settings-saved">{t("imageSettings.saved")}</div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Audio settings view (section=audio) ──────────────────────────────────────

function AudioSettingsView() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([api.models.list("audio"), api.state.get(), api.modelSettings.get()])
      .then(([ms, state, ms2]) => {
        setModels(ms);
        setAllModelSettings(ms2);
        const fromSection = state.audioModelId ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setSelectedId(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  const model = models.find((m) => m.id === selectedId);

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("audioSettings.title")}</h2>
        <p className="page-subtitle">{t("audioSettings.subtitle")}</p>
      </div>

      <div className="settings-field">
        <label className="settings-field__label">{t("audioSettings.model")}</label>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            void api.state.patch({ section: "audio", sectionModelId: e.target.value });
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {model && (
        <div className="model-settings-panel">
          {model.description && <p className="model-settings-panel__desc">{model.description}</p>}
          <div className="model-settings-panel__cost">
            {model.tokenCostPerMPixel > 0
              ? `${model.tokenCostPerMPixel.toFixed(2)} ✦${t("manage.price.perMPixel")}`
              : model.tokenCostPerRequest > 0
                ? `${model.tokenCostPerRequest.toFixed(2)} ✦${t("manage.price.perReq")}`
                : model.tokenCostApproxMsg > 0
                  ? `~${model.tokenCostApproxMsg.toFixed(2)} ✦${t("manage.price.perMsg")}`
                  : null}
          </div>
          {model.settings.length > 0 && (
            <SettingsPanel
              settings={model.settings}
              values={allModelSettings[model.id] ?? {}}
              onChange={(key, val) => handleSettingChange(model.id, key, val)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Dispatcher with tab bar ───────────────────────────────────────────────────

type ManageTab = "gpt" | "design" | "video" | "audio";

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
        {(["gpt", "design", "video", "audio"] as ManageTab[]).map((s) => (
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
        {tab === "design" && <ImageSettingsView />}
        {tab === "video" && <VideoSettingsView />}
        {tab === "audio" && <AudioSettingsView />}
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
