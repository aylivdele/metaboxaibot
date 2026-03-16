import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client.js";
import type { Dialog, Model, UserState } from "../types.js";

const SECTION_LABELS: Record<string, string> = {
  gpt: "💡 GPT",
  design: "🎨 Design",
  audio: "🎧 Audio",
  video: "🎬 Video",
};

const VALID_SECTIONS = ["gpt", "design", "audio", "video"] as const;

interface ManagementPageProps {
  initialSection?: string;
}

export function ManagementPage({ initialSection }: ManagementPageProps) {
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [state, setState] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creating, setCreating] = useState(false);
  const validInitial = VALID_SECTIONS.includes(initialSection as (typeof VALID_SECTIONS)[number])
    ? initialSection!
    : "gpt";
  const [activeSection, setActiveSection] = useState<string>(validInitial);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ds, ms, st] = await Promise.all([
      api.dialogs.list(),
      api.models.list(),
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

  function sectionDialogKey(section: string): keyof UserState {
    const map: Record<string, keyof UserState> = {
      gpt: "gptDialogId",
      design: "designDialogId",
      audio: "audioDialogId",
      video: "videoDialogId",
    };
    return map[section] ?? "gptDialogId";
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this dialog?")) return;
    await api.dialogs.delete(id);
    setDialogs((ds) => ds.filter((d) => d.id !== id));
    const key = sectionDialogKey(activeSection);
    if (state?.[key] === id) {
      setState((s) => (s ? { ...s, [key]: null } : s));
    }
  };

  const handleActivate = async (dialog: Dialog) => {
    await api.dialogs.activate(dialog.id);
    const key = sectionDialogKey(activeSection);
    setState((s) => (s ? { ...s, [key]: dialog.id, modelId: dialog.modelId } : s));
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
      const dialog = await api.dialogs.create(activeSection, modelId);
      await api.dialogs.activate(dialog.id);
      const key = sectionDialogKey(activeSection);
      setState((s) => (s ? { ...s, [key]: dialog.id, modelId } : s));
      setDialogs((ds) => [dialog, ...ds]);
      setIsCreating(false);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="page-loading">Loading…</div>;

  const filteredDialogs = dialogs.filter((d) => d.section === activeSection);
  const sectionModels = models.filter((m) => m.section === activeSection);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dialogs</h2>
        <p className="page-subtitle">Manage your AI conversations</p>
      </div>

      <div className="section-chips">
        {VALID_SECTIONS.map((s) => (
          <button
            key={s}
            className={`chip${activeSection === s ? " chip--active" : ""}`}
            onClick={() => {
              setActiveSection(s);
              setIsCreating(false);
            }}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {isCreating ? (
        <div className="model-picker">
          <div className="model-picker__header">
            <span>Choose a model</span>
            <button className="action-btn" onClick={() => setIsCreating(false)}>
              ✕
            </button>
          </div>
          {sectionModels.length === 0 ? (
            <div className="empty-state">No models available</div>
          ) : (
            sectionModels.map((m) => (
              <div
                key={m.id}
                className={`model-item${creating ? " model-item--disabled" : ""}`}
                onClick={() => !creating && void handleCreateDialog(m.id)}
              >
                <div className="model-item__name">{m.name}</div>
                <div className="model-item__meta">
                  ${m.costUsdPerRequest.toFixed(3)} · {m.provider}
                  {m.supportsImages && " · 🖼"}
                  {m.supportsVoice && " · 🎙"}
                  {m.isAsync && " · ⏳"}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="dialog-list">
          <button className="new-dialog-btn" onClick={() => setIsCreating(true)}>
            ＋ New dialog
          </button>

          {filteredDialogs.length === 0 ? (
            <div className="empty-state">No dialogs in this section</div>
          ) : (
            filteredDialogs.map((d) => (
              <div
                key={d.id}
                className={`dialog-item${state?.[sectionDialogKey(activeSection)] === d.id ? " dialog-item--active" : ""}`}
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
                    <div className="dialog-item__info">
                      <div className="dialog-item__title">{d.title ?? d.modelId}</div>
                      <div className="dialog-item__meta">
                        {d.modelId} · {new Date(d.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="dialog-item__actions">
                      {state?.[sectionDialogKey(activeSection)] !== d.id && (
                        <button
                          className="action-btn action-btn--primary"
                          onClick={() => void handleActivate(d)}
                          title="Set active"
                        >
                          ▶
                        </button>
                      )}
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
