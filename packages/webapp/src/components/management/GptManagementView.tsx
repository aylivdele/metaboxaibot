import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { Dialog, Model, UserState } from "../../types.js";
import { ChatHistory } from "./ChatHistory.js";
import { SettingsPanel } from "./SettingsPanel.js";

type ModelFilter = "all" | "images" | "voice" | "web";

function formatModelPrice(
  m: Model,
  perReqLabel: string,
  perMsgLabel: string,
  perMPixelLabel: string,
  perSecLabel: string,
): string {
  if (m.isLLM) {
    return `~${m.tokenCostApproxMsg.toFixed(2)} ✦${perMsgLabel}`;
  }
  if (m.tokenCostPerMPixel > 0) {
    return `${m.tokenCostPerMPixel.toFixed(2)} ✦${perMPixelLabel}`;
  }
  if (m.tokenCostPerSecond > 0) {
    return `${m.tokenCostPerSecond.toFixed(2)} ✦${perSecLabel}`;
  }
  if (m.tokenCostPerRequest > 0) {
    return `${m.tokenCostPerRequest.toFixed(2)} ✦${perReqLabel}`;
  }
  return m.provider;
}

export function GptManagementView() {
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
  const [settingsDialog, setSettingsDialog] = useState<Dialog | null>(null);
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
    if (settingsDialog?.id === id) setSettingsDialog(null);
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

  if (viewingDialog) {
    return <ChatHistory dialog={viewingDialog} onBack={() => setViewingDialog(null)} />;
  }

  if (settingsDialog) {
    const dlgModel = models.find((m) => m.id === settingsDialog.modelId);
    return (
      <div className="page">
        <div className="page-header">
          <button className="back-btn" onClick={() => setSettingsDialog(null)}>
            {t("common.back")}
          </button>
          <h2>{settingsDialog.title ?? settingsDialog.modelId}</h2>
          {dlgModel && <p className="page-subtitle">{dlgModel.name}</p>}
        </div>
        {dlgModel && dlgModel.settings.length > 0 ? (
          <div className="model-settings-panel">
            <SettingsPanel
              settings={dlgModel.settings}
              values={allModelSettings[dlgModel.id] ?? {}}
              onChange={(key, val) => handleSettingChange(dlgModel.id, key, val)}
            />
          </div>
        ) : (
          <div className="empty-state">{t("manage.noSettings")}</div>
        )}
      </div>
    );
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
                      t("manage.price.perSec"),
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
                      onClick={() => setSettingsDialog(d)}
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
