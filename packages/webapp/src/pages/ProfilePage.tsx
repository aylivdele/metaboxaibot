import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { TranslationKey } from "../i18n.js";
// import { BannerSlider } from "../components/BannerSlider.js";
import type { UserProfile, GalleryJob, GalleryOutput, Model, ModelSettingDef } from "../types.js";
import { openExternalLink } from "../utils/telegram.js";
import { SETTING_TRANSLATIONS } from "@metabox/shared-browser";

export type ProfileTab = "overview" | "gallery" | "account";

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
  autotranslate: "profile.reason.autotranslate",
  describe_image: "profile.reason.describe_image",
  soul_creation: "profile.reason.soul_creation",
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
      {/* <BannerSlider /> */}

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
        <button
          className={`profile-tabs__btn${activeTab === "account" ? " profile-tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("account")}
        >
          Аккаунт
        </button>
      </div>

      {activeTab === "overview" && <OverviewTab profile={profile} />}
      {activeTab === "gallery" && <GalleryTab />}
      {activeTab === "account" && <AccountTab profile={profile} />}
    </div>
  );
}

/* ── Subscription Countdown ────────────────────────────────────────────────── */

function useCountdown(endDate: string) {
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) {
        setText("Подписка истекла");
        setUrgent(true);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (days >= 1) {
        const w = days === 1 ? "день" : days < 5 ? "дня" : "дней";
        setText(`${days} ${w}`);
        setUrgent(false);
      } else if (hours >= 1) {
        setText(`${hours} ч ${minutes} мин`);
        setUrgent(true);
      } else {
        setText(`${minutes} мин ${seconds} сек`);
        setUrgent(true);
      }
    };
    update();
    const diff = new Date(endDate).getTime() - Date.now();
    const interval = setInterval(update, diff < 86400000 ? 1000 : 60000);
    return () => clearInterval(interval);
  }, [endDate]);

  return { text, urgent };
}

/* ── Overview Tab ──────────────────────────────────────────────────────────── */

function OverviewTab({ profile }: { profile: UserProfile }) {
  const { t } = useI18n();
  const sub = profile.subscription;
  const progressPct = sub ? Math.max(0, Math.min(100, (sub.daysLeft / sub.totalDays) * 100)) : 0;
  const countdown = useCountdown(sub?.endDate ?? "");

  return (
    <>
      <div className="balance-card">
        <div className="balance-card__label">{t("profile.balance")}</div>
        <div className="balance-card__amount">✦ {formatTokens(profile.tokenBalance)}</div>
        <div className="balance-card__breakdown">
          <span className="balance-card__breakdown-item">
            {t("profile.balanceSubscription")}: ✦ {formatTokens(profile.subscriptionTokenBalance)}
          </span>
          <span className="balance-card__breakdown-item">
            {t("profile.balancePurchased")}: ✦ {formatTokens(profile.purchasedTokenBalance)}
          </span>
        </div>
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
            <span
              className={`sub-card__days-left${countdown.urgent ? " sub-card__days-left--urgent" : ""}`}
            >
              {countdown.text}
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
  const [items, setItems] = useState<GalleryJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsJob, setDetailsJob] = useState<GalleryJob | null>(null);
  // modelId → Model — used by the details modal to render setting labels and
  // option labels (settings page-style) instead of raw key/value strings.
  // Cached per section visit; refreshed when the active section chip changes.
  const [modelsById, setModelsById] = useState<Record<string, Model>>({});
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

  // Fetch model definitions once per section change. Failure is silent — the
  // modal falls back to raw key/value rendering when models are missing.
  // Note: gallery jobs use section "image" in the DB but the corresponding
  // model definitions live under section "design" (legacy naming). Map the
  // chip section to the API section so the dropdown actually returns models.
  useEffect(() => {
    let cancelled = false;
    const apiSection = section === "image" ? "design" : section;
    api.models
      .list(apiSection)
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, Model> = {};
        for (const m of list) map[m.id] = m;
        setModelsById((prev) => ({ ...prev, ...map }));
      })
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [section]);

  const handleSectionChange = (sec: Section) => {
    setSection(sec);
    setPage(1);
  };

  const handleSend = useCallback(async (jobId: string) => {
    await api.gallery.sendJob(jobId);
  }, []);

  const handleDelete = useCallback(async (jobId: string) => {
    await api.gallery.deleteJob(jobId);
    setItems((prev) => prev.filter((j) => j.id !== jobId));
    setTotal((prev) => Math.max(0, prev - 1));
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
          {items.map((job) => (
            <GalleryCard
              key={job.id}
              job={job}
              onSend={handleSend}
              onDelete={handleDelete}
              onOpenDetails={setDetailsJob}
            />
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

      {detailsJob &&
        createPortal(
          <GalleryDetailsModal
            job={detailsJob}
            model={modelsById[detailsJob.modelId] ?? null}
            onClose={() => setDetailsJob(null)}
          />,
          document.body,
        )}
    </>
  );
}

function formatGalleryTokens(raw: string | null): string | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Up to 2 decimals, trim trailing zeros so whole numbers show as "5", not "5.00".
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Module-level handle to the single audio element currently playing across all
 * gallery cards. Starting a new playback invokes `stop` on the previous one so
 * overlapping clips are not possible.
 */
let activeGalleryAudio: { stop: () => void } | null = null;

function AudioPlayButton({
  resolveUrl,
  title,
}: {
  resolveUrl: () => Promise<string>;
  title: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setLoading(false);
  };

  useEffect(() => {
    return () => {
      if (activeGalleryAudio?.stop === stop) activeGalleryAudio = null;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing || loading) {
      stop();
      if (activeGalleryAudio?.stop === stop) activeGalleryAudio = null;
      return;
    }
    // Halt any other card that is currently playing before we start.
    activeGalleryAudio?.stop();
    activeGalleryAudio = { stop };

    setLoading(true);
    let url: string;
    try {
      url = await resolveUrl();
    } catch {
      setLoading(false);
      if (activeGalleryAudio?.stop === stop) activeGalleryAudio = null;
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.addEventListener(
      "canplay",
      () => {
        setLoading(false);
        setPlaying(true);
      },
      { once: true },
    );
    audio.onended = () => {
      setPlaying(false);
      if (activeGalleryAudio?.stop === stop) activeGalleryAudio = null;
    };
    audio.play().catch(() => {
      setLoading(false);
      setPlaying(false);
      if (activeGalleryAudio?.stop === stop) activeGalleryAudio = null;
    });
  };

  return (
    <button
      className={`voice-picker__play-btn${playing ? " voice-picker__play-btn--playing" : ""}${loading ? " voice-picker__play-btn--loading" : ""}`}
      onClick={toggle}
      title={title}
    >
      {loading ? "⏳" : playing ? "⏹" : "▶"}
    </button>
  );
}

function GalleryCard({
  job,
  onSend,
  onDelete,
  onOpenDetails,
}: {
  job: GalleryJob;
  onSend: (jobId: string) => Promise<void>;
  onDelete: (jobId: string) => Promise<void>;
  onOpenDetails: (job: GalleryJob) => void;
}) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, true>>({});
  // Track per-image load state so we can swap the shimmer skeleton out for
  // the real <img> only once it has actually decoded. Cleared on error so
  // the placeholder also disappears for broken thumbnails.
  const [imgLoaded, setImgLoaded] = useState<Record<string, true>>({});
  const markLoaded = (id: string) => setImgLoaded((p) => ({ ...p, [id]: true }));
  const markErrored = (id: string) => {
    setImgErrors((p) => ({ ...p, [id]: true }));
    setImgLoaded((p) => ({ ...p, [id]: true }));
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  const isImage = job.section === "image";
  const isVideo = job.section === "video";
  const isAudio = job.section === "audio";

  const outputs = job.outputs;
  // Preview-only "active" output: video poster + audio play button operate on
  // a single output. For batches the first output is shown; tap-to-switch on
  // tiles is not exposed here since "Send to chat" now ships the whole job.
  const previewOutput: GalleryOutput | undefined = outputs[0];

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSend(job.id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openVideo = async () => {
    if (videoLoading || videoUrl || !previewOutput) return;
    setVideoLoading(true);
    try {
      const res = await api.gallery.previewUrl(previewOutput.id);
      setVideoUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVideoLoading(false);
    }
  };

  const resolveAudioUrl = async () => {
    if (!previewOutput) throw new Error("No output");
    const res = await api.gallery.previewUrl(previewOutput.id);
    return res.url;
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const tokens = formatGalleryTokens(job.tokensSpent);
  const tokensLabel = tokens ? `${tokens} ${t("gallery.costTokens")}` : t("gallery.costUnknown");
  const collageOutputs = outputs.slice(0, 4);

  return (
    <div className="gallery-card">
      <button
        type="button"
        className="gallery-card__delete"
        onClick={() => setConfirmDelete(true)}
        title={t("gallery.delete")}
        aria-label={t("gallery.delete")}
      >
        ×
      </button>

      {isImage && outputs.length > 1 ? (
        <div
          className={`gallery-card__outputs${
            collageOutputs.length === 3 ? " gallery-card__outputs--three" : ""
          }`}
        >
          {collageOutputs.map((out, i) => {
            const showOverlay = i === 3 && outputs.length > 4;
            const errored = imgErrors[out.id];
            const loaded = imgLoaded[out.id];
            const src = out.thumbnailUrl ?? out.previewUrl ?? out.outputUrl ?? "";
            return (
              <div key={out.id} className="gallery-card__output-tile">
                {!loaded && src && <div className="gallery-skeleton" />}
                {!errored && src && (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    onLoad={() => markLoaded(out.id)}
                    onError={() => markErrored(out.id)}
                  />
                )}
                {showOverlay && (
                  <div className="gallery-card__output-overlay">
                    {t("gallery.morePhotos").replace("{n}", String(outputs.length - 4))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isImage && previewOutput ? (
        <div className="gallery-card__preview">
          {!imgLoaded[previewOutput.id] && <div className="gallery-skeleton" />}
          {!imgErrors[previewOutput.id] && (
            <img
              src={
                previewOutput.thumbnailUrl ??
                previewOutput.previewUrl ??
                previewOutput.outputUrl ??
                ""
              }
              alt={job.prompt}
              loading="lazy"
              onLoad={() => markLoaded(previewOutput.id)}
              onError={() => markErrored(previewOutput.id)}
            />
          )}
        </div>
      ) : isVideo ? (
        <div
          className="gallery-card__preview gallery-card__preview--video"
          onClick={openVideo}
          role="button"
          tabIndex={0}
        >
          {previewOutput?.thumbnailUrl && !imgLoaded[previewOutput.id] && (
            <div className="gallery-skeleton" />
          )}
          {previewOutput?.thumbnailUrl && !imgErrors[previewOutput.id] ? (
            <img
              src={previewOutput.thumbnailUrl}
              alt={job.prompt}
              loading="lazy"
              onLoad={() => markLoaded(previewOutput.id)}
              onError={() => markErrored(previewOutput.id)}
            />
          ) : (
            <div className="gallery-card__placeholder">🎬</div>
          )}
          <div className="gallery-card__video-overlay">{videoLoading ? "⏳" : "▶"}</div>
        </div>
      ) : isAudio ? (
        <div className="gallery-card__preview gallery-card__preview--audio">
          <AudioPlayButton resolveUrl={resolveAudioUrl} title={t("uploads.play")} />
        </div>
      ) : null}

      <div className="gallery-card__body">
        {isImage ? (
          // Design cards run two-up in a grid, so the single-row meta strip
          // overflows. Stack model / cost / date vertically and drop the
          // prompt preview entirely — it's available in the details modal.
          <div className="gallery-card__meta gallery-card__meta--stacked">
            <span className="gallery-card__model" title={job.modelName}>
              {job.modelName}
            </span>
            <span className="gallery-card__cost">{tokensLabel}</span>
            {job.completedAt && (
              <span className="gallery-card__date">
                {new Date(job.completedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="gallery-card__meta">
              <div className="gallery-card__model-row">
                <span className="gallery-card__model" title={job.modelName}>
                  {job.modelName}
                </span>
                <span className="gallery-card__cost">{tokensLabel}</span>
              </div>
              {job.completedAt && (
                <span className="gallery-card__date">
                  {new Date(job.completedAt).toLocaleDateString(
                    locale === "ru" ? "ru-RU" : "en-US",
                  )}
                </span>
              )}
            </div>
            <p className="gallery-card__prompt">{job.prompt}</p>
          </>
        )}
        {error && <p className="gallery-card__error">{error}</p>}
        <div className="gallery-card__actions">
          <button
            className={`gallery-card__btn${sent ? " gallery-card__btn--sent" : ""}`}
            onClick={handleSend}
            disabled={loading || sent || outputs.length === 0}
          >
            {loading ? "…" : sent ? t("gallery.sent") : t("gallery.download")}
          </button>
          <button
            type="button"
            className="gallery-card__btn gallery-card__btn--secondary"
            onClick={() => onOpenDetails(job)}
          >
            {t("gallery.details")}
          </button>
        </div>
      </div>

      {confirmDelete &&
        createPortal(
          <div className="modal-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">{t("gallery.confirmDeleteTitle")}</div>
              <div className="modal-text">{t("gallery.confirmDeleteText")}</div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  {t("gallery.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "…" : t("gallery.confirmDelete")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {videoUrl &&
        createPortal(
          <div className="modal-overlay" onClick={() => setVideoUrl(null)}>
            <div className="video-modal" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="modal-close"
                onClick={() => setVideoUrl(null)}
                aria-label="Close"
              >
                ×
              </button>
              <video src={videoUrl} controls autoPlay playsInline className="video-modal__player" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Setting display helpers ──────────────────────────────────────────────────

/** Picker companion fields — internal IDs/URLs without a user-visible meaning. */
const ALWAYS_HIDDEN_SETTING_KEYS = new Set([
  "voice_url",
  "voice_s3key",
  "voice_provider",
  "talking_photo_id",
  "avatar_photo_url",
  "avatar_photo_s3key",
  "image_asset_id", // surfaced via the avatar-picker fallback below
]);

const OPENAI_VOICE_NAMES: Record<string, string> = {
  alloy: "Alloy",
  ash: "Ash",
  coral: "Coral",
  echo: "Echo",
  fable: "Fable",
  nova: "Nova",
  onyx: "Onyx",
  sage: "Sage",
  shimmer: "Shimmer",
};

interface PickerCatalogs {
  heygenVoices?: Map<string, string>;
  didVoices?: Map<string, string>;
  elevenlabsVoices?: Map<string, string>;
  /** elevenlabs cloned voices keyed by externalId. */
  userVoices?: Map<string, string>;
  heygenAvatars?: Map<string, string>;
  /** HeyGen-uploaded photos keyed by externalId (matches image_asset_id). */
  userAvatarsHeygen?: Map<string, string>;
  /** HiggsField souls keyed by externalId (matches custom_reference_id). */
  userAvatarsHiggsfield?: Map<string, string>;
  motions?: Map<string, string>;
  soulStyles?: Map<string, string>;
}

function GalleryDetailsModal({
  job,
  model,
  onClose,
}: {
  job: GalleryJob;
  model: Model | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<PickerCatalogs>({});
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);
  const downloadRef = useRef<HTMLDivElement | null>(null);

  // Fetch picker catalogs (voices/avatars/motions/styles) needed to resolve
  // ID-shaped setting values into friendly names. Only the catalogs the
  // model actually uses are fetched, in parallel. Failures are silent — the
  // affected entries fall through to "—" or stay hidden.
  useEffect(() => {
    if (!model) {
      setCatalogsLoaded(true);
      return;
    }
    let cancelled = false;
    const types = new Set(model.settings.map((s) => s.type));
    const next: PickerCatalogs = {};
    const tasks: Promise<unknown>[] = [];

    const add = <T,>(p: Promise<T>, set: (data: T) => void) => {
      tasks.push(p.then((data) => !cancelled && set(data)).catch(() => void 0));
    };

    if (types.has("voice-picker")) {
      add(api.heygenVoices.list(), (data) => {
        next.heygenVoices = new Map(data.map((v) => [v.voice_id, v.name]));
      });
    }
    if (types.has("did-voice-picker")) {
      add(api.didVoices.list(), (data) => {
        next.didVoices = new Map(data.map((v) => [v.id, v.name]));
      });
    }
    if (types.has("elevenlabs-voice-picker")) {
      add(api.elevenlabsVoices.list(), (data) => {
        next.elevenlabsVoices = new Map(data.map((v) => [v.voice_id, v.name]));
      });
    }
    if (
      types.has("voice-picker") ||
      types.has("did-voice-picker") ||
      types.has("elevenlabs-voice-picker")
    ) {
      add(api.userVoices.list("elevenlabs"), (data) => {
        next.userVoices = new Map(
          data.map((v) => [v.externalId ?? v.id, v.name] as [string, string]),
        );
      });
    }
    if (types.has("avatar-picker")) {
      add(api.heygenAvatars.list({}), (data) => {
        next.heygenAvatars = new Map(data.items.map((a) => [a.avatar_id, a.avatar_name]));
      });
      add(api.userAvatars.list("heygen"), (data) => {
        next.userAvatarsHeygen = new Map(
          data.map((a) => [a.externalId ?? a.id, a.name] as [string, string]),
        );
      });
    }
    if (types.has("motion-picker")) {
      add(api.higgsfieldMotions.list(), (data) => {
        next.motions = new Map(data.map((m) => [m.id, m.name]));
      });
    }
    if (types.has("soul-picker")) {
      add(api.userAvatars.list("higgsfield_soul"), (data) => {
        next.userAvatarsHiggsfield = new Map(
          data.map((a) => [a.externalId ?? a.id, a.name] as [string, string]),
        );
      });
    }
    if (types.has("soul-style-picker")) {
      add(api.soulStyles.list(), (data) => {
        next.soulStyles = new Map(data.map((s) => [s.id, s.name]));
      });
    }

    Promise.all(tasks).finally(() => {
      if (cancelled) return;
      setCatalogs(next);
      setCatalogsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [model]);

  // Build human-readable settings entries. Picker IDs are looked up in
  // `catalogs`; failures and never-useful companion keys are dropped from the
  // list entirely so the user only sees meaningful rows.
  const settingLocale = SETTING_TRANSLATIONS[locale] ?? SETTING_TRANSLATIONS["en"] ?? {};
  const rawSettings = job.modelSettings ?? {};

  const resolvePickerValue = (def: ModelSettingDef, value: unknown): string | null => {
    if (def.type === "motion-picker") {
      if (!Array.isArray(value) || value.length === 0) return null;
      return (
        value
          .map((m) => {
            const entry = m as { id?: string; strength?: number };
            const name = (entry.id && catalogs.motions?.get(entry.id)) ?? entry.id ?? "";
            if (!name) return null;
            return entry.strength !== undefined ? `${name} (${entry.strength})` : name;
          })
          .filter((s): s is string => !!s)
          .join(", ") || null
      );
    }
    if (typeof value !== "string" || !value) return null;
    if (def.type === "voice-picker") {
      return catalogs.heygenVoices?.get(value) ?? catalogs.userVoices?.get(value) ?? null;
    }
    if (def.type === "did-voice-picker") {
      return catalogs.didVoices?.get(value) ?? catalogs.userVoices?.get(value) ?? null;
    }
    if (def.type === "elevenlabs-voice-picker") {
      return catalogs.elevenlabsVoices?.get(value) ?? catalogs.userVoices?.get(value) ?? null;
    }
    if (def.type === "openai-voice-picker") {
      return OPENAI_VOICE_NAMES[value] ?? value;
    }
    if (def.type === "avatar-picker") {
      return catalogs.heygenAvatars?.get(value) ?? catalogs.userAvatarsHeygen?.get(value) ?? null;
    }
    if (def.type === "soul-picker") {
      return catalogs.userAvatarsHiggsfield?.get(value) ?? null;
    }
    if (def.type === "soul-style-picker") {
      return catalogs.soulStyles?.get(value) ?? null;
    }
    return null;
  };

  const formatValue = (def: ModelSettingDef | undefined, value: unknown): string => {
    if (Array.isArray(value)) return value.map((v) => formatValue(def, v)).join(", ");
    if (
      def?.options &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    ) {
      const opt = def.options.find((o) => o.value === value);
      if (opt) {
        const settingT = settingLocale[def.key];
        return settingT?.options?.[String(opt.value)] ?? opt.label;
      }
    }
    if (typeof value === "boolean") return value ? "✓" : "—";
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    return String(value);
  };

  type Entry = { key: string; label: string; value: string };
  const entries: Entry[] = [];
  const seenKeys = new Set<string>();

  // Pass 1: walk the model's setting defs in their declared order so the
  // displayed list mirrors the order on the settings page.
  for (const def of model?.settings ?? []) {
    seenKeys.add(def.key);

    let raw: unknown = rawSettings[def.key];
    // Avatar-picker stores either avatar_id (official) or image_asset_id
    // (uploaded photo) — fall back to the latter so the row is not lost.
    if (def.type === "avatar-picker") {
      seenKeys.add("image_asset_id");
      if ((raw === "" || raw === null || raw === undefined) && rawSettings.image_asset_id) {
        raw = rawSettings.image_asset_id;
      }
    }

    if (raw === null || raw === undefined || raw === "") continue;
    if (Array.isArray(raw) && raw.length === 0) continue;

    const isPicker =
      def.type === "voice-picker" ||
      def.type === "did-voice-picker" ||
      def.type === "elevenlabs-voice-picker" ||
      def.type === "openai-voice-picker" ||
      def.type === "avatar-picker" ||
      def.type === "motion-picker" ||
      def.type === "soul-picker" ||
      def.type === "soul-style-picker";

    const label = settingLocale[def.key]?.label ?? def.label;
    let valueStr: string | null;
    if (isPicker) {
      // Picker still loading? show a placeholder so the row reserves space.
      if (!catalogsLoaded) valueStr = "…";
      else valueStr = resolvePickerValue(def, raw);
    } else {
      valueStr = formatValue(def, raw);
    }
    if (valueStr === null || valueStr === "") continue;
    entries.push({ key: def.key, label, value: valueStr });
  }

  // Pass 2: any keys present in modelSettings but missing from the current
  // model definition (setting may have been removed since). Show with a
  // best-effort label, but skip the always-hidden technical companion keys.
  for (const [key, value] of Object.entries(rawSettings)) {
    if (seenKeys.has(key)) continue;
    if (ALWAYS_HIDDEN_SETTING_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const label = settingLocale[key]?.label ?? key;
    entries.push({ key, label, value: formatValue(undefined, value) });
  }

  const settingsEntries = entries;

  // Close the dropdown when the user clicks outside it.
  useEffect(() => {
    if (!downloadOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!downloadRef.current?.contains(e.target as Node)) setDownloadOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [downloadOpen]);

  const downloadOutput = async (outputId: string) => {
    setDownloadingId(outputId);
    setError(null);
    try {
      const { url } = await api.gallery.originalUrl(outputId);
      openExternalLink(url);
      setDownloadOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const outputLabelKey = (() => {
    if (job.section === "video") return "gallery.outputLabel.video" as const;
    if (job.section === "audio") return "gallery.outputLabel.audio" as const;
    return "gallery.outputLabel.image" as const;
  })();

  const handleApplySettings = async () => {
    setApplying(true);
    setError(null);
    try {
      await api.modelSettings.set(job.modelId, job.modelSettings ?? {});
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(job.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card gallery-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="close">
          ×
        </button>
        <h3 className="modal-title">{job.modelName}</h3>

        <div className="gallery-modal__section">
          <div className="gallery-modal__label">{t("gallery.prompt")}</div>
          <div className="gallery-modal__prompt">{job.prompt}</div>
        </div>

        <div className="gallery-modal__section">
          <div className="gallery-modal__label">{t("gallery.settings")}</div>
          {settingsEntries.length === 0 ? (
            <div className="gallery-modal__settings">{t("gallery.noSettings")}</div>
          ) : (
            <div className="gallery-modal__settings">
              {settingsEntries.map((entry) => (
                <div key={entry.key} className="gallery-modal__setting-row">
                  <span className="gallery-modal__setting-key">{entry.label}</span>
                  <span className="gallery-modal__setting-val">{entry.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="gallery-modal__error">❌ {error}</div>}

        <div className="gallery-modal__actions">
          {job.outputs.length <= 1 ? (
            <button
              type="button"
              className="gallery-card__btn"
              onClick={() => job.outputs[0] && downloadOutput(job.outputs[0].id)}
              disabled={downloadingId !== null || job.outputs.length === 0}
            >
              {downloadingId ? "…" : t("gallery.downloadOriginal")}
            </button>
          ) : (
            <div className="gallery-modal__download" ref={downloadRef}>
              <button
                type="button"
                className="gallery-card__btn gallery-modal__download-toggle"
                onClick={() => setDownloadOpen((v) => !v)}
                disabled={downloadingId !== null}
              >
                <span>{downloadingId ? "…" : t("gallery.downloadOriginal")}</span>
                <span className="gallery-modal__download-caret">▾</span>
              </button>
              {downloadOpen && (
                <div className="gallery-modal__download-menu" role="listbox">
                  {job.outputs.map((out, i) => (
                    <button
                      key={out.id}
                      type="button"
                      className="gallery-modal__download-item"
                      onClick={() => downloadOutput(out.id)}
                      disabled={downloadingId !== null}
                      role="option"
                    >
                      {t(outputLabelKey).replace("{n}", String(i + 1))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className={`gallery-card__btn${applied ? " gallery-card__btn--sent" : ""}`}
            onClick={handleApplySettings}
            disabled={applying || applied}
          >
            {applying ? "…" : applied ? t("gallery.applied") : t("gallery.applySettings")}
          </button>
          <button
            type="button"
            className={`gallery-card__btn gallery-card__btn--secondary${
              copied ? " gallery-card__btn--sent" : ""
            }`}
            onClick={handleCopyPrompt}
          >
            {copied ? t("gallery.copied") : t("gallery.copyPrompt")}
          </button>
        </div>

        <div className="gallery-modal__retention-note">{t("gallery.retentionNote")}</div>
      </div>
    </div>
  );
}

/* ── Account tab ────────────────────────────────────────────────────────── */

interface AccountData {
  balance: number;
  totalEarned: number;
  userStatus: string;
  referralCode: string | null;
  email: string | null;
  mentor: {
    name: string;
    email: string | null;
    telegramUsername: string | null;
    telegramPhone: string | null;
  } | null;
}

function AccountTab(_props: { profile: UserProfile }) {
  const [data, setData] = useState<AccountData | null>(null);

  useEffect(() => {
    api.profile
      .partnerBalance()
      .then((d) => setData(d as unknown as AccountData))
      .catch(() => {});
  }, []);

  return (
    <div className="account-tab">
      {/* Email */}
      <div className="account-section">
        <div className="account-label">Email</div>
        <div className="account-value">
          {data?.email ? (
            <span>{data.email}</span>
          ) : (
            <span className="account-hint">Аккаунт Metabox не привязан</span>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="account-section">
        <div className="account-label">Статус</div>
        <div className="account-value">
          {data?.userStatus === "PARTNER"
            ? "Партнёр"
            : data?.userStatus === "CLIENT"
              ? "Клиент"
              : "Пользователь"}
        </div>
      </div>

      {/* Mentor */}
      {data?.mentor && (
        <div className="account-section">
          <div className="account-label">Наставник</div>
          <div className="account-value">
            <div className="account-mentor-name">{data.mentor.name}</div>
            {data.mentor.telegramUsername ? (
              <a
                href={`https://t.me/${data.mentor.telegramUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="account-mentor-link"
              >
                @{data.mentor.telegramUsername}
              </a>
            ) : data.mentor.telegramPhone ? (
              <a
                href={`https://t.me/+${data.mentor.telegramPhone.replace(/^\+/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="account-mentor-link"
              >
                {data.mentor.telegramPhone}
              </a>
            ) : data.mentor.email ? (
              <div className="account-mentor-email">{data.mentor.email}</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Referral code */}
      {data?.referralCode && (
        <div className="account-section">
          <div className="account-label">Реферальный код</div>
          <div className="account-value account-value--mono">{data.referralCode}</div>
        </div>
      )}
    </div>
  );
}
