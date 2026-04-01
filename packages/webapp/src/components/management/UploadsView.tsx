import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { UserUpload, UserVoice } from "../../types.js";

export function UploadsView() {
  const { t } = useI18n();
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [clonedVoices, setClonedVoices] = useState<UserVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    Promise.all([api.uploads.list(), api.userVoices.list("elevenlabs")])
      .then(([u, v]) => {
        setUploads(u);
        setClonedVoices(v);
      })
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

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const saveEditUpload = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    const updated = await api.uploads.rename(id, editName.trim()).catch(() => null);
    if (updated)
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, name: editName.trim() } : u)));
    setEditingId(null);
  };

  const saveEditVoice = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    const updated = await api.userVoices.rename(id, editName.trim()).catch(() => null);
    if (updated)
      setClonedVoices((prev) =>
        prev.map((v) => (v.id === id ? { ...v, name: editName.trim() } : v)),
      );
    setEditingId(null);
  };

  const deleteUpload = async (id: string) => {
    if (!confirm(t("uploads.confirmDelete"))) return;
    await api.uploads.delete(id).catch(console.error);
    setUploads((prev) => prev.filter((u) => u.id !== id));
    if (playingId === id) stopAudio();
  };

  const deleteVoice = async (id: string) => {
    if (!confirm(t("uploads.confirmDeleteVoice"))) return;
    await api.userVoices.delete(id).catch(console.error);
    setClonedVoices((prev) => prev.filter((v) => v.id !== id));
    if (playingId === id) stopAudio();
  };

  const photos = uploads.filter((u) => u.type === "photo" || u.type === "avatar_photo");
  const hasContent = clonedVoices.length > 0 || photos.length > 0;

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("uploads.title")}</h2>
        <p className="page-subtitle">{t("uploads.subtitle")}</p>
      </div>

      {!hasContent ? (
        <p className="uploads-empty">{t("uploads.empty")}</p>
      ) : (
        <>
          {/* Cloned voices (ElevenLabs) */}
          {clonedVoices.length > 0 && (
            <section className="uploads-section">
              <h3 className="uploads-section__title">{t("uploads.clonedVoicesTitle")}</h3>
              <div className="uploads-list">
                {clonedVoices.map((voice) => (
                  <div key={voice.id} className="uploads-item">
                    {voice.previewUrl ? (
                      <button
                        className={`voice-picker__play-btn${playingId === voice.id ? " voice-picker__play-btn--playing" : ""}${loadingId === voice.id ? " voice-picker__play-btn--loading" : ""}`}
                        onClick={() => playPreview(voice.id, voice.previewUrl!)}
                        title={t("uploads.play")}
                      >
                        {loadingId === voice.id ? "⏳" : playingId === voice.id ? "⏹" : "▶"}
                      </button>
                    ) : (
                      <span className="voice-picker__play-btn voice-picker__play-btn--disabled">
                        ▶
                      </span>
                    )}
                    <div className="uploads-item__info">
                      {editingId === voice.id ? (
                        <input
                          className="uploads-item__name-input"
                          value={editName}
                          autoFocus
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEditVoice(voice.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => void saveEditVoice(voice.id)}
                        />
                      ) : (
                        <span
                          className="uploads-item__name"
                          onClick={() => startEdit(voice.id, voice.name)}
                        >
                          {voice.name}
                        </span>
                      )}
                      <div className="uploads-item__bottom">
                        <span className="uploads-item__meta">
                          ElevenLabs · {new Date(voice.createdAt).toLocaleDateString()}
                        </span>
                        <div className="uploads-item__actions">
                          <button
                            className="uploads-item__btn uploads-item__btn--rename"
                            onClick={() => startEdit(voice.id, voice.name)}
                            title={t("uploads.rename")}
                          >
                            ✏
                          </button>
                          <button
                            className="uploads-item__btn uploads-item__btn--delete"
                            onClick={() => void deleteVoice(voice.id)}
                            title={t("uploads.delete")}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Photos */}
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
                            if (e.key === "Enter") void saveEditUpload(upload.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => void saveEditUpload(upload.id)}
                        />
                      ) : (
                        <span
                          className="uploads-photo-card__name"
                          onClick={() => startEdit(upload.id, upload.name)}
                        >
                          {upload.name}
                        </span>
                      )}
                      <div className="uploads-item__actions">
                        <button
                          className="uploads-item__btn uploads-item__btn--rename"
                          onClick={() => startEdit(upload.id, upload.name)}
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
        </>
      )}
    </div>
  );
}
