import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { GalleryItem } from "../types.js";

const SECTIONS = ["image", "audio", "video"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<Section, string> = {
  image: "🎨 Images",
  audio: "🎧 Audio",
  video: "🎬 Video",
};

const SECTION_LABELS_RU: Record<Section, string> = {
  image: "🎨 Изображения",
  audio: "🎧 Аудио",
  video: "🎬 Видео",
};

function GalleryCard({
  item,
  onSend,
}: {
  item: GalleryItem;
  onSend: (id: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [videoActive, setVideoActive] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSend(item.id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const previewUrl = item.previewUrl;
  const isImage = item.section === "image";
  const isVideo = item.section === "video";
  const isAudio = item.section === "audio";

  return (
    <div className="gallery-card">
      {/* Media preview */}
      {isImage && previewUrl && !imgError && (
        <div className="gallery-card__preview">
          <img
            src={item.thumbnailUrl ?? previewUrl}
            alt={item.prompt}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      {isVideo && previewUrl && (
        <div
          className="gallery-card__preview gallery-card__preview--video"
          onClick={() => !videoActive && setVideoActive(true)}
        >
          {videoActive ? (
            <video src={previewUrl} autoPlay controls muted playsInline />
          ) : (
            <div className="gallery-card__video-overlay">▶</div>
          )}
        </div>
      )}
      {isAudio && <div className="gallery-card__audio-icon">🎵</div>}

      <div className="gallery-card__body">
        <div className="gallery-card__meta">
          <span className="gallery-card__model">{item.modelId}</span>
          {item.completedAt && (
            <span className="gallery-card__date">
              {new Date(item.completedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}
            </span>
          )}
        </div>
        <p className="gallery-card__prompt">{item.prompt}</p>
        {error && <p className="gallery-card__error">❌ {error}</p>}
        <button
          className={`gallery-card__btn${sent ? " gallery-card__btn--sent" : ""}`}
          onClick={handleSend}
          disabled={loading || sent}
        >
          {loading ? "…" : sent ? t("gallery.sent") : t("gallery.download")}
        </button>
      </div>
    </div>
  );
}

export function GalleryPage() {
  const { t, locale } = useI18n();
  const [section, setSection] = useState<Section>("image");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback((sec: Section, pg: number) => {
    setLoading(true);
    setError(null);
    api.gallery
      .list({ section: sec, page: pg, limit: LIMIT })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(section, page);
  }, [section, page, load]);

  const handleSectionChange = (sec: Section) => {
    setSection(sec);
    setPage(1);
  };

  const handleSend = useCallback(async (id: string) => {
    await api.gallery.download(id);
  }, []);

  const totalPages = Math.ceil(total / LIMIT);
  const labels = locale === "ru" ? SECTION_LABELS_RU : SECTION_LABELS;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("gallery.title")}</h2>
        <p className="page-subtitle">{t("gallery.subtitle")}</p>
      </div>

      <div className="section-chips">
        {SECTIONS.map((sec) => (
          <button
            key={sec}
            className={`chip${section === sec ? " chip--active" : ""}`}
            onClick={() => handleSectionChange(sec)}
          >
            {labels[sec]}
          </button>
        ))}
      </div>

      {loading && <div className="page-loading">{t("common.loading")}</div>}
      {error && <div className="page-error">❌ {error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">{t("gallery.empty")}</div>
      )}

      {!loading && items.length > 0 && (
        <div className={`gallery-grid${section === "image" ? " gallery-grid--2col" : ""}`}>
          {items.map((item) => (
            <GalleryCard key={item.id} item={item} onSend={handleSend} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination__btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            {t("admin.prevPage")}
          </button>
          <span className="pagination__info">
            {page} / {totalPages}
          </span>
          <button
            className="pagination__btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            {t("admin.nextPage")}
          </button>
        </div>
      )}
    </div>
  );
}
