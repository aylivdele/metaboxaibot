import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { TranslationKey } from "../i18n.js";
import { BannerSlider } from "../components/BannerSlider.js";
import type { UserProfile, GalleryItem } from "../types.js";

export type ProfileTab = "overview" | "gallery";

/**
 * Format a token amount with dynamic precision so small values never show as 0.00.
 * ≥ 0.01  → 2 decimal places  (e.g. 0.29, 12.50)
 * ≥ 0.001 → 3 decimal places  (e.g. 0.005)
 * < 0.001 → 4 decimal places  (e.g. 0.0003)
 */
function formatTokens(value: string | number): string {
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs === 0) return "0.00";
  if (abs >= 0.01) return sign + abs.toFixed(2);
  if (abs >= 0.001) return sign + abs.toFixed(3);
  return sign + abs.toFixed(4);
}

const REASON_KEYS: Record<string, string> = {
  welcome_bonus: "profile.reason.welcome_bonus",
  ai_usage: "profile.reason.ai_usage",
  purchase: "profile.reason.purchase",
  metabox_purchase: "profile.reason.metabox_purchase",
  referral_bonus: "profile.reason.referral_bonus",
  admin: "profile.reason.admin",
};

export function ProfilePage({ initialSection }: { initialSection?: ProfileTab }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialSection ?? "overview");

  useEffect(() => {
    api.profile
      .get()
      .then(setProfile)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!profile) return null;

  const firstName = profile.firstName ?? profile.username ?? `User ${profile.id.slice(-4)}`;
  const displayName = profile.lastName ? `${firstName} ${profile.lastName}` : firstName;

  return (
    <div className="page">
      <BannerSlider />

      <div className="profile-header">
        <div className="profile-avatar">{displayName[0].toUpperCase()}</div>
        <div className="profile-name">{displayName}</div>
        {profile.username && <div className="profile-username">@{profile.username}</div>}
      </div>

      <div className="profile-tabs">
        <button
          className={`profile-tabs__btn${activeTab === "overview" ? " profile-tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          {t("profile.tabOverview")}
        </button>
        <button
          className={`profile-tabs__btn${activeTab === "gallery" ? " profile-tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("gallery")}
        >
          {t("profile.tabGallery")}
        </button>
      </div>

      {activeTab === "overview" && <OverviewTab profile={profile} />}
      {activeTab === "gallery" && <GalleryTab />}
    </div>
  );
}

/* ── Overview Tab ──────────────────────────────────────────────────────────── */

function OverviewTab({ profile }: { profile: UserProfile }) {
  const { t } = useI18n();
  const sub = profile.subscription;
  const progressPct = sub ? Math.max(0, Math.min(100, (sub.daysLeft / sub.totalDays) * 100)) : 0;

  return (
    <>
      <div className="balance-card">
        <div className="balance-card__label">{t("profile.balance")}</div>
        <div className="balance-card__amount">✦ {formatTokens(profile.tokenBalance)}</div>
        <div className="balance-card__sub">
          {t("profile.referrals")}: {profile.referralCount}
        </div>
      </div>

      {sub && (
        <div className="sub-card">
          <div className="sub-card__header">
            <span className="sub-card__plan">{sub.planName}</span>
            <span className="sub-card__period">{sub.period}</span>
          </div>
          <div className="sub-card__days">
            <span className="sub-card__days-left">
              {sub.daysLeft} {sub.daysLeft === 1 ? "день" : sub.daysLeft < 5 ? "дня" : "дней"}
            </span>
            <span className="sub-card__end-date">
              до {new Date(sub.endDate).toLocaleDateString("ru-RU")}
            </span>
          </div>
          <div className="sub-card__bar">
            <div className="sub-card__bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="section-title">{t("profile.txHistory")}</div>
      {profile.transactions.length === 0 ? (
        <div className="empty-state">{t("profile.noTx")}</div>
      ) : (
        <ul className="tx-list">
          {profile.transactions.map((tx) => (
            <li key={tx.id} className="tx-item">
              <div className="tx-item__info">
                <span className="tx-item__reason">
                  {tx.description ||
                    (REASON_KEYS[tx.reason]
                      ? t(REASON_KEYS[tx.reason] as TranslationKey)
                      : tx.reason)}
                </span>
                {tx.modelId && <span className="tx-item__model">{tx.modelId}</span>}
                <span className="tx-item__date">{new Date(tx.createdAt).toLocaleDateString()}</span>
              </div>
              <span className={`tx-item__amount tx-item__amount--${tx.type}`}>
                {tx.type === "credit" ? "+" : ""}
                {formatTokens(tx.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── Gallery Tab ───────────────────────────────────────────────────────────── */

const SECTIONS = ["image", "audio", "video"] as const;
type Section = (typeof SECTIONS)[number];

function GalleryTab() {
  const { t, locale } = useI18n();
  const [section, setSection] = useState<Section>("image");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const LIMIT = 20;

  const sectionLabels: Record<Section, string> = {
    image: locale === "ru" ? "🎨 Изображения" : "🎨 Images",
    audio: locale === "ru" ? "🎧 Аудио" : "🎧 Audio",
    video: locale === "ru" ? "🎬 Видео" : "🎬 Video",
  };

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

  return (
    <>
      <div className="section-chips" style={{ marginTop: 8 }}>
        {SECTIONS.map((sec) => (
          <button
            key={sec}
            className={`chip${section === sec ? " chip--active" : ""}`}
            onClick={() => handleSectionChange(sec)}
          >
            {sectionLabels[sec]}
          </button>
        ))}
      </div>

      {loading && <div className="page-loading">{t("common.loading")}</div>}
      {error && <div className="page-error">{error}</div>}

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
    </>
  );
}

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

  const previewUrl = item.outputUrl;
  const isImage = item.section === "image";
  const isVideo = item.section === "video";
  const isAudio = item.section === "audio";

  return (
    <div className="gallery-card">
      {isImage && previewUrl && !imgError && (
        <div className="gallery-card__preview">
          <img
            src={previewUrl}
            alt={item.prompt}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      {isVideo && previewUrl && (
        <div className="gallery-card__preview gallery-card__preview--video">
          <video src={previewUrl} preload="metadata" controls={false} muted playsInline />
          <div className="gallery-card__video-overlay">▶</div>
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
        {error && <p className="gallery-card__error">{error}</p>}
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
