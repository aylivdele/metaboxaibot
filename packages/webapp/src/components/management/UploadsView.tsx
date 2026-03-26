import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { UserUpload } from "../../types.js";

export function UploadsView() {
  const { t } = useI18n();
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
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
    setLoadingId(null);
  };

  const playPreview = (id: string, url: string) => {
    if (playingId === id || loadingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    setLoadingId(id);
    audio.addEventListener(
      "canplay",
      () => {
        setLoadingId(null);
        setPlayingId(id);
      },
      { once: true },
    );
    audio.play().catch(() => setLoadingId(null));
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

  const voices = uploads.filter((u) => u.type === "voice");
  const photos = uploads.filter((u) => u.type === "photo" || u.type === "avatar_photo");
  const others = uploads.filter(
    (u) => u.type !== "voice" && u.type !== "photo" && u.type !== "avatar_photo",
  );

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
        <>
          {photos.length > 0 && (
            <section className="uploads-section">
              <h3 className="uploads-section__title">{t("uploads.photosTitle")}</h3>
              <div className="uploads-photos-grid">
                {photos.map((upload) => (
                  <div key={upload.id} className="uploads-photo-card">
                    <img src={upload.url} alt={upload.name} className="uploads-photo-card__img" />
                    <div className="uploads-photo-card__footer">
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
                        <span
                          className="uploads-photo-card__name"
                          onClick={() => startEdit(upload)}
                        >
                          {upload.name}
                        </span>
                      )}
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
                  </div>
                ))}
              </div>
            </section>
          )}

          {(voices.length > 0 || others.length > 0) && (
            <section className="uploads-section">
              {photos.length > 0 && (
                <h3 className="uploads-section__title">{t("uploads.voicesTitle")}</h3>
              )}
              <div className="uploads-list">
                {[...voices, ...others].map((upload) => (
                  <div key={upload.id} className="uploads-item">
                    <button
                      className={`voice-picker__play-btn${playingId === upload.id ? " voice-picker__play-btn--playing" : ""}${loadingId === upload.id ? " voice-picker__play-btn--loading" : ""}`}
                      onClick={() => playPreview(upload.id, upload.url)}
                      title={t("uploads.play")}
                    >
                      {loadingId === upload.id ? "⏳" : playingId === upload.id ? "⏹" : "▶"}
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
