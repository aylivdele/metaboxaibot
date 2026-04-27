import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { UserAvatar } from "../types.js";
import { closeMiniApp } from "../utils/telegram.js";

type ProviderFilter = "all" | "heygen" | "higgsfield_soul";

export function AvatarsPage() {
  const { t } = useI18n();
  const [avatars, setAvatars] = useState<UserAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProviderFilter>("all");
  const [creatingProvider, setCreatingProvider] = useState<string | null>(null);
  const [createHint, setCreateHint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAvatar | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.userAvatars
      .list()
      .then(setAvatars)
      .catch(() => setAvatars([]))
      .finally(() => setLoading(false));
  }, []);

  const displayed = filter === "all" ? avatars : avatars.filter((a) => a.provider === filter);

  const handleCreate = async (provider: string) => {
    setCreatingProvider(provider);
    try {
      await api.userAvatars.startCreation(provider);
      setCreateHint(provider);
      setTimeout(() => setCreateHint(null), 5000);
      closeMiniApp();
    } finally {
      setCreatingProvider(null);
    }
  };

  const startRename = (avatar: UserAvatar) => {
    setEditingId(avatar.id);
    setEditingName(avatar.name);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setSavingId(id);
    try {
      await api.userAvatars.rename(id, name);
      setAvatars((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.userAvatars.delete(deleteTarget.id).catch(() => void 0);
      setAvatars((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="avatars-page">
      {createHint && (
        <div className="activated-popup">
          {createHint === "heygen" ? t("uploads.createAvatarHint") : t("uploads.createSoulHint")}
        </div>
      )}

      <div className="avatars-page__filters">
        {(["all", "heygen", "higgsfield_soul"] as ProviderFilter[]).map((p) => (
          <button
            key={p}
            className={`avatars-page__filter-btn${filter === p ? " avatars-page__filter-btn--active" : ""}`}
            onClick={() => setFilter(p)}
          >
            {p === "all"
              ? t("avatars.filterAll")
              : p === "heygen"
                ? t("avatars.filterHeyGen")
                : t("avatars.filterSoul")}
          </button>
        ))}
      </div>

      <div className="avatars-page__create-row">
        <button
          className="voice-picker__create-btn"
          onClick={() => void handleCreate("heygen")}
          disabled={creatingProvider === "heygen"}
        >
          {creatingProvider === "heygen" ? "…" : t("uploads.createAvatar")}
        </button>
        <button
          className="voice-picker__create-btn"
          onClick={() => void handleCreate("higgsfield_soul")}
          disabled={creatingProvider === "higgsfield_soul"}
        >
          {creatingProvider === "higgsfield_soul" ? "…" : t("uploads.createSoul")}
        </button>
      </div>

      {loading ? (
        <div className="voice-picker__loading">{t("common.loading")}</div>
      ) : displayed.length === 0 ? (
        <div className="voice-picker__empty">{t("avatars.empty")}</div>
      ) : (
        <div className="avatars-page__grid">
          {displayed.map((avatar) => {
            const isOrphaned = avatar.status === "orphaned";
            const isFailed = avatar.status === "failed";
            const isCreating = avatar.status === "creating";
            const isEditing = editingId === avatar.id;

            return (
              <div
                key={avatar.id}
                className={`avatars-page__card${isOrphaned || isFailed ? " avatars-page__card--muted" : ""}`}
              >
                {avatar.previewUrl && !isOrphaned ? (
                  <img className="avatars-page__img" src={avatar.previewUrl} alt={avatar.name} />
                ) : (
                  <div className="avatars-page__img avatars-page__img--placeholder">
                    {isCreating ? "⏳" : isOrphaned ? "⚠️" : isFailed ? "❌" : "👤"}
                  </div>
                )}

                <span
                  className={`avatars-page__provider avatars-page__provider--${avatar.provider}`}
                >
                  {avatar.provider === "heygen" ? "HeyGen" : "Soul"}
                </span>

                {isEditing ? (
                  <div className="avatars-page__rename-row">
                    <input
                      className="avatars-page__rename-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(avatar.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      autoFocus
                    />
                    <button
                      className="avatars-page__action-btn"
                      onClick={() => void saveRename(avatar.id)}
                      disabled={savingId === avatar.id}
                    >
                      {savingId === avatar.id ? "…" : "✓"}
                    </button>
                    <button className="avatars-page__action-btn" onClick={cancelRename}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <span
                    className="avatars-page__name"
                    title={isOrphaned ? t("uploads.avatarOrphanedHint") : undefined}
                  >
                    {isCreating
                      ? t("uploads.avatarCreating")
                      : isOrphaned
                        ? `${avatar.name} — ${t("uploads.avatarOrphaned")}`
                        : avatar.name}
                  </span>
                )}

                {!isCreating && !isEditing && (
                  <div className="avatars-page__actions">
                    <button
                      className="avatars-page__action-btn"
                      onClick={() => startRename(avatar)}
                    >
                      ⚙
                    </button>
                    <button
                      className="avatars-page__action-btn avatars-page__action-btn--danger"
                      onClick={() => setDeleteTarget(avatar)}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget &&
        createPortal(
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">{t("avatars.confirmDeleteTitle")}</div>
              <div className="modal-text">{t("avatars.confirmDeleteText")}</div>
              <div className="modal-actions">
                <button
                  className="btn btn--secondary"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  {t("gallery.cancel")}
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                >
                  {deleting ? "…" : t("gallery.confirmDelete")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
