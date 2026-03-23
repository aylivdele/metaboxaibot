import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { Dialog, Message, Model, UserState } from "../types.js";

// ── Universal duration control ────────────────────────────────────────────────

interface DurationControlProps {
  model: Model;
  value: number | undefined;
  onChange: (duration: number) => void;
  secondsLabel: string;
  fixedLabel: string;
}

function DurationControl({
  model,
  value,
  onChange,
  secondsLabel,
  fixedLabel,
}: DurationControlProps) {
  const { durationRange, supportedDurations } = model;

  // Continuous slider
  if (durationRange) {
    const { min, max } = durationRange;
    const current = value ?? min;
    return (
      <div className="duration-slider-wrap">
        <div className="duration-slider-value">
          {current}
          <span>{secondsLabel}</span>
        </div>
        <input
          type="range"
          className="duration-slider"
          min={min}
          max={max}
          step={1}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="duration-range-labels">
          <span>
            {min}
            {secondsLabel}
          </span>
          <span>
            {max}
            {secondsLabel}
          </span>
        </div>
      </div>
    );
  }

  // Discrete presets
  if (supportedDurations && supportedDurations.length > 0) {
    return (
      <div className="image-settings-ratios">
        {supportedDurations.map((sec) => (
          <button
            key={sec}
            className={`ratio-btn${value === sec ? " ratio-btn--active" : ""}`}
            onClick={() => onChange(sec)}
          >
            {sec}
            {secondsLabel}
          </button>
        ))}
      </div>
    );
  }

  // Fixed / not configurable
  return <div className="image-settings-model__no-support">{fixedLabel}</div>;
}

// ── Video settings view (section=video) ──────────────────────────────────────

function VideoSettingsView() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [settings, setSettings] = useState<
    Record<string, { aspectRatio?: string; duration?: number }>
  >({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.models.list("video"), api.videoSettings.get(), api.state.get()])
      .then(([ms, s, state]) => {
        setModels(ms);
        setSettings(s);
        const fromSection = state.videoModelId ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setSelectedId(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handlePatch = async (
    modelId: string,
    patch: { aspectRatio?: string; duration?: number },
  ) => {
    setSettings((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], ...patch },
    }));
    await api.videoSettings.set(modelId, patch);
    setSavedId(modelId);
    setTimeout(() => setSavedId((id) => (id === modelId ? null : id)), 1500);
  };

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  const model = models.find((m) => m.id === selectedId);
  const current = model ? (settings[model.id] ?? {}) : {};

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
          <div className="video-settings-section">
            <div className="video-settings-label">{t("videoSettings.aspectRatio")}</div>
            {!model.supportedAspectRatios || model.supportedAspectRatios.length === 0 ? (
              <div className="image-settings-model__no-support">
                {t("videoSettings.noAspectSupport")}
              </div>
            ) : (
              <div className="image-settings-ratios">
                {model.supportedAspectRatios.map((ratio) => (
                  <button
                    key={ratio}
                    className={`ratio-btn${current.aspectRatio === ratio ? " ratio-btn--active" : ""}`}
                    onClick={() => void handlePatch(model.id, { aspectRatio: ratio })}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="video-settings-section">
            <div className="video-settings-label">{t("videoSettings.duration")}</div>
            <DurationControl
              model={model}
              value={current.duration}
              onChange={(duration) => void handlePatch(model.id, { duration })}
              secondsLabel={t("videoSettings.seconds")}
              fixedLabel={t("videoSettings.noDurationSupport")}
            />
          </div>

          {savedId === model.id && (
            <div className="model-settings-saved">{t("videoSettings.saved")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Image settings view (section=design) ────────────────────────────────────

function ImageSettingsView() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [settings, setSettings] = useState<Record<string, { aspectRatio: string }>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.models.list("design"), api.imageSettings.get(), api.state.get()])
      .then(([ms, s, state]) => {
        setModels(ms);
        setSettings(s);
        const fromSection = state.designModelId ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setSelectedId(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (modelId: string, ratio: string) => {
    setSettings((prev) => ({ ...prev, [modelId]: { aspectRatio: ratio } }));
    await api.imageSettings.set(modelId, ratio);
    setSavedId(modelId);
    setTimeout(() => setSavedId((id) => (id === modelId ? null : id)), 1500);
  };

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  const model = models.find((m) => m.id === selectedId);
  const ratios = model?.supportedAspectRatios;
  const current = model ? settings[model.id]?.aspectRatio : undefined;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("imageSettings.title")}</h2>
        <p className="page-subtitle">{t("imageSettings.subtitle")}</p>
      </div>

      <div className="settings-field">
        <label className="settings-field__label">{t("imageSettings.model")}</label>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            void api.state.patch({ section: "design", sectionModelId: e.target.value });
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
          {!ratios || ratios.length === 0 ? (
            <div className="image-settings-model__no-support">{t("imageSettings.noSupport")}</div>
          ) : (
            <div className="image-settings-ratios">
              {ratios.map((ratio) => (
                <button
                  key={ratio}
                  className={`ratio-btn${current === ratio ? " ratio-btn--active" : ""}`}
                  onClick={() => void handleSelect(model.id, ratio)}
                >
                  {ratio}
                </button>
              ))}
            </div>
          )}
          {savedId === model.id && (
            <div className="model-settings-saved">{t("imageSettings.saved")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Audio settings view (section=audio) ──────────────────────────────────────

function AudioSettingsView() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.models.list("audio"), api.state.get()])
      .then(([ms, state]) => {
        setModels(ms);
        const fromSection = state.audioModelId ?? undefined;
        const initial =
          fromSection && ms.some((m) => m.id === fromSection) ? fromSection : (ms[0]?.id ?? "");
        setSelectedId(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
            {model.tokenCostPerRequest > 0
              ? `${model.tokenCostPerRequest.toFixed(2)} ✦ / запрос`
              : model.tokenCostApproxMsg > 0
                ? `~${model.tokenCostApproxMsg.toFixed(2)} ✦ / сообщение`
                : null}
          </div>
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

function formatModelPrice(m: Model, perReqLabel: string, perMsgLabel: string): string {
  if (m.isLLM) {
    return `~${m.tokenCostApproxMsg.toFixed(2)} ✦${perMsgLabel}`;
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
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewingDialog, setViewingDialog] = useState<Dialog | null>(null);
  const [filter, setFilter] = useState<ModelFilter>("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ds, ms, st] = await Promise.all([
      api.dialogs.list("gpt"),
      api.models.list("gpt"),
      api.state.get(),
    ]);
    setDialogs(ds);
    setModels(ms);
    setState(st);
    setLoading(false);
  }, []);

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
                    {formatModelPrice(m, t("manage.price.perReq"), t("manage.price.perMsg"))} ·{" "}
                    {m.provider}
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
