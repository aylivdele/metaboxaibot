import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { Dialog, Model, UserState } from "../../types.js";
import { ChatHistory } from "./ChatHistory.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { closeMiniApp } from "../../utils/telegram.js";

type ModelFilter = "images" | "files" | "web";

const PROVIDER_ORDER = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "xai",
  "perplexity",
  "alibaba",
] as const;
type ProviderId = (typeof PROVIDER_ORDER)[number];

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

export function GptManagementView({ initialAction }: { initialAction?: string } = {}) {
  const { t } = useI18n();
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [state, setState] = useState<UserState | null>(null);
  const [allModelSettings, setAllModelSettings] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(initialAction === "new");
  const [creating, setCreating] = useState(false);
  const [activatedPopup, setActivatedPopup] = useState(false);
  const [viewingDialog, setViewingDialog] = useState<Dialog | null>(null);
  const [settingsDialog, setSettingsDialog] = useState<Dialog | null>(null);
  const [dialogSettings, setDialogSettings] = useState<Record<string, unknown>>({});
  const [dialogSettingsLoading, setDialogSettingsLoading] = useState(false);
  const [filters, setFilters] = useState<Set<ModelFilter>>(new Set());
  const [familyFilter, setFamilyFilter] = useState<ProviderId | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
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

  const handleDialogSettingChange = (dialogId: string, key: string, value: unknown) => {
    setDialogSettings((prev) => ({ ...prev, [key]: value }));
    const dKey = `dlg_${dialogId}__${key}`;
    clearTimeout(debounceRef.current[dKey]);
    debounceRef.current[dKey] = setTimeout(() => {
      void api.modelSettings.setForDialog(dialogId, { [key]: value });
    }, 800);
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, [loadData]);

  useEffect(() => {
    if (!settingsDialog) return;
    setDialogSettingsLoading(true);
    setEditingTitle(false);
    api.modelSettings
      .getForDialog(settingsDialog.id)
      .then((ds) => setDialogSettings(ds))
      .catch(() => setDialogSettings({}))
      .finally(() => setDialogSettingsLoading(false));
  }, [settingsDialog?.id]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("manage.confirmDelete"))) return;
    try {
      await api.dialogs.delete(id);
    } catch {
      return;
    }
    setDialogs((ds) => ds.filter((d) => d.id !== id));
    if (state?.gptDialogId === id) {
      setState((s) => (s ? { ...s, gptDialogId: null } : s));
    }
    if (viewingDialog?.id === id) setViewingDialog(null);
    if (settingsDialog?.id === id) setSettingsDialog(null);
  };

  const handleActivate = async (dialog: Dialog) => {
    const alreadyActive =
      state?.gptDialogId === dialog.id &&
      (state?.section === "gpt" || state?.state === "GPT_ACTIVE");
    if (alreadyActive) {
      closeMiniApp();
      return;
    }
    await api.dialogs.activate(dialog.id);
    // setState((s) => (s ? { ...s, gptDialogId: dialog.id, gptModelId: dialog.modelId } : s));
    closeMiniApp();
  };

  const handleRename = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    const trimmed = newTitle.trim();
    await api.dialogs.rename(id, trimmed);
    setDialogs((ds) => ds.map((d) => (d.id === id ? { ...d, title: trimmed } : d)));
    if (settingsDialog?.id === id) {
      setSettingsDialog((prev) => (prev ? { ...prev, title: trimmed } : prev));
    }
    setEditingTitle(false);
  };

  const handleCreateDialog = async (modelId: string) => {
    setCreating(true);
    try {
      const dialog = await api.dialogs.create("gpt", modelId);
      await api.dialogs.activate(dialog.id);
      setState((s) => (s ? { ...s, gptDialogId: dialog.id, gptModelId: modelId } : s));
      setDialogs((ds) => [dialog, ...ds]);
      setIsCreating(false);
      setActivatedPopup(true);
      setTimeout(() => setActivatedPopup(false), 3000);
      setSettingsDialog(dialog);
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
        {activatedPopup && (
          <div className="activated-popup">{t("manage.dialogActivatedPopup")}</div>
        )}
        <div className="page-header">
          <button className="back-btn" onClick={() => setSettingsDialog(null)}>
            {t("common.back")}
          </button>
          {editingTitle ? (
            <div className="dialog-title-edit">
              <input
                className="dialog-title-edit__input"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRename(settingsDialog.id, editTitleValue);
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                autoFocus
              />
              <button
                className="action-btn action-btn--primary"
                onClick={() => void handleRename(settingsDialog.id, editTitleValue)}
              >
                ✓
              </button>
              <button className="action-btn" onClick={() => setEditingTitle(false)}>
                ✕
              </button>
            </div>
          ) : (
            <h2
              className="dialog-title-editable"
              onClick={() => {
                setEditTitleValue(settingsDialog.title ?? "");
                setEditingTitle(true);
              }}
            >
              {settingsDialog.title ?? settingsDialog.modelId}
              <span className="dialog-title-editable__icon">✏️</span>
            </h2>
          )}
          {dlgModel && <p className="page-subtitle">{dlgModel.name}</p>}
        </div>
        {dlgModel && dlgModel.settings.length > 0 ? (
          dialogSettingsLoading ? (
            <div className="page-loading">{t("common.loading")}</div>
          ) : (
            <div className="model-settings-panel">
              <SettingsPanel
                settings={dlgModel.settings}
                values={{ ...(allModelSettings[dlgModel.id] ?? {}), ...dialogSettings }}
                onChange={(key, val) => handleDialogSettingChange(settingsDialog.id, key, val)}
              />
            </div>
          )
        ) : (
          <div className="empty-state">{t("manage.noSettings")}</div>
        )}
        <div className="family-card__btn-row" style={{ padding: "0 16px 16px" }}>
          <button
            className="family-card__activate-btn"
            onClick={() => void handleActivate(settingsDialog)}
          >
            {t("manage.startChat")}
          </button>
          {dlgModel && dlgModel.settings.length > 0 && (
            <button
              className="family-card__reset-btn"
              onClick={() => {
                const defaults: Record<string, unknown> = {};
                for (const def of dlgModel.settings) {
                  defaults[def.key] = def.default ?? null;
                }
                setDialogSettings(defaults);
                void api.modelSettings.setForDialog(settingsDialog.id, defaults);
              }}
              title={t("imageSettings.resetTitle")}
            >
              {t("imageSettings.reset")}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  return (
    <div className="page" onClick={() => menuOpenId && setMenuOpenId(null)}>
      {activatedPopup && <div className="activated-popup">{t("manage.dialogActivatedPopup")}</div>}
      <div className="page-header">
        <h2>{t("manage.title")}</h2>
        <p className="page-subtitle">{t("manage.subtitle")}</p>
      </div>

      {isCreating ? (
        (() => {
          const availableFamilies = PROVIDER_ORDER.filter((p) =>
            models.some((m) => m.provider === p),
          );
          const filteredModels = models.filter((m) => {
            if (familyFilter && m.provider !== familyFilter) return false;
            if (filters.size === 0) return true;
            if (filters.has("images") && !m.supportsImages) return false;
            if (filters.has("files") && !m.supportsDocuments) return false;
            if (filters.has("web") && !m.supportsWeb) return false;
            return true;
          });
          return (
            <div className="model-picker">
              <div className="model-picker__header">
                <span>{t("manage.chooseModel")}</span>
                <button className="action-btn" onClick={() => setIsCreating(false)}>
                  ✕
                </button>
              </div>

              <div className="model-family-bar">
                <button
                  className={`model-family-btn${familyFilter === null ? " model-family-btn--active" : ""}`}
                  onClick={() => setFamilyFilter(null)}
                >
                  {t("manage.filter.family.all")}
                </button>
                {availableFamilies.map((p) => (
                  <button
                    key={p}
                    className={`model-family-btn${familyFilter === p ? " model-family-btn--active" : ""}`}
                    onClick={() => setFamilyFilter(p)}
                  >
                    {t(`manage.filter.family.${p}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>

              <div className="model-filter-bar">
                {(["images", "files", "web"] as ModelFilter[]).map((f) => (
                  <button
                    key={f}
                    className={`model-filter-btn${filters.has(f) ? " model-filter-btn--active" : ""}`}
                    onClick={() =>
                      setFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(f)) next.delete(f);
                        else next.add(f);
                        return next;
                      })
                    }
                  >
                    {t(`manage.filter.${f}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>

              <div className="model-legend">
                <span>{t("manage.legend.images")}</span>
                <span>{t("manage.legend.files")}</span>
                <span>{t("manage.legend.web")}</span>
              </div>

              {filteredModels.length === 0 ? (
                <div className="empty-state">{t("manage.noModels")}</div>
              ) : (
                filteredModels.map((m) => (
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
                      {m.supportsDocuments && " · 📄"}
                      {m.supportsWeb && " · 🌐"}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })()
      ) : (
        <div className="dialog-list">
          <button className="new-dialog-btn" onClick={() => setIsCreating(true)}>
            {t("manage.newDialog")}
          </button>

          {dialogs.length === 0 ? (
            <div className="empty-state">{t("manage.noDialogs")}</div>
          ) : (
            dialogs.map((d) => {
              const isActive = state?.gptDialogId === d.id;
              return (
                <div key={d.id} className={`dialog-item${isActive ? " dialog-item--active" : ""}`}>
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
                    <button
                      className={`action-btn${isActive ? "" : " action-btn--primary"}`}
                      onClick={() => void handleActivate(d)}
                      title={t("manage.activate")}
                    >
                      {isActive ? "↗" : "▶"}
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => setViewingDialog(d)}
                      title={t("manage.history")}
                    >
                      💬
                    </button>
                    <div className="dialog-item__menu-wrap">
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === d.id ? null : d.id);
                        }}
                        title={t("manage.settings")}
                      >
                        ⚙️
                      </button>
                      {menuOpenId === d.id && (
                        <div className="dialog-item__dropdown">
                          <button
                            className="dialog-item__dropdown-item"
                            onClick={() => {
                              setMenuOpenId(null);
                              setSettingsDialog(d);
                            }}
                          >
                            {t("manage.settings")}
                          </button>
                          <button
                            className="dialog-item__dropdown-item dialog-item__dropdown-item--danger"
                            onClick={() => {
                              setMenuOpenId(null);
                              void handleDelete(d.id);
                            }}
                          >
                            {t("manage.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
