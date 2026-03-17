import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { GalleryItem } from "../types.js";

const SECTIONS = ["image", "audio", "video"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_ICON: Record<Section, string> = {
  image: "🎨",
  audio: "🎧",
  video: "🎬",
};

function GalleryItemCard({ item, onDownload }: { item: GalleryItem; onDownload: (id: string) => Promise<void> }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      await onDownload(item.id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gallery-item">
      <div className="gallery-item__meta">
        <span className="gallery-item__model">{item.modelId}</span>
        {item.completedAt && (
          <span className="gallery-item__date">
            {new Date(item.completedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className="gallery-item__prompt">{item.prompt}</p>
      {error && <p className="gallery-item__error">❌ {error}</p>}
      <button
        className={`gallery-item__download${sent ? " gallery-item__download--sent" : ""}`}
        onClick={handleDownload}
        disabled={loading || sent}
      >
        {loading ? "…" : sent ? t("gallery.sent") : t("gallery.download")}
      </button>
    </div>
  );
}

export function GalleryPage() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("image");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(
    (sec: Section, pg: number) => {
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
    },
    [],
  );

  useEffect(() => {
    load(section, page);
  }, [section, page, load]);

  const handleSectionChange = (sec: Section) => {
    setSection(sec);
    setPage(1);
  };

  const handleDownload = useCallback(async (id: string) => {
    await api.gallery.download(id);
  }, []);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="page">
      <div className="section-title">{t("gallery.title")}</div>
      <p className="page-subtitle">{t("gallery.subtitle")}</p>

      <div className="tab-bar">
        {SECTIONS.map((sec) => (
          <button
            key={sec}
            className={`tab-bar__tab${section === sec ? " tab-bar__tab--active" : ""}`}
            onClick={() => handleSectionChange(sec)}
          >
            {SECTION_ICON[sec]} {t(`gallery.section.${sec}` as any)}
          </button>
        ))}
      </div>

      {loading && <div className="page-loading">{t("common.loading")}</div>}
      {error && <div className="page-error">❌ {error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">{t("gallery.empty")}</div>
      )}

      {!loading && items.length > 0 && (
        <div className="gallery-list">
          {items.map((item) => (
            <GalleryItemCard key={item.id} item={item} onDownload={handleDownload} />
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
