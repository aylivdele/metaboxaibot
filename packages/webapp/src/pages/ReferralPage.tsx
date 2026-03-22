import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { UserProfile } from "../types.js";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? "MetaboxAIBot";
const METABOX_URL = import.meta.env.VITE_METABOX_URL ?? "https://app.meta-box.ru";

function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    });
  };
  return { copied, copy };
}

function shareLink(url: string, text: string) {
  const tg = (
    window as Window & { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }
  ).Telegram?.WebApp;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, "_blank");
  }
}

export function ReferralPage({ onLinkMetabox }: { onLinkMetabox: () => void }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    api.profile.get().then(setProfile).catch(console.error);
  }, []);

  const botLink = profile ? `https://t.me/${BOT_USERNAME}?start=ref_${profile.id}` : null;
  const metaboxLink = profile?.metaboxReferralCode
    ? `${METABOX_URL}/register?ref=${profile.metaboxReferralCode}`
    : null;

  const botCopy = useCopy();
  const metaboxCopy = useCopy();

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("referral.title")}</h2>
        <p className="page-subtitle">{t("referral.subtitle")}</p>
      </div>

      <div className="referral-stats">
        <div className="referral-stat">
          <div className="referral-stat__value">{profile?.referralCount ?? "—"}</div>
          <div className="referral-stat__label">{t("referral.invited")}</div>
        </div>
        <div className="referral-stat">
          <div className="referral-stat__value">0.5</div>
          <div className="referral-stat__label">{t("referral.perReferral")}</div>
        </div>
      </div>

      {/* Bot referral link */}
      <div className="referral-card">
        <div className="referral-card__type">{t("referral.botLink")}</div>
        <div className="referral-card__label">{t("referral.botLinkHint")}</div>
        <div className="referral-card__link">{botLink ?? t("common.loading")}</div>
        <div className="referral-card__actions">
          <button
            className="btn btn--secondary"
            onClick={() => botLink && botCopy.copy(botLink)}
            disabled={!botLink}
          >
            {botCopy.copied ? t("referral.copied") : t("referral.copy")}
          </button>
          <button
            className="btn btn--primary"
            onClick={() => botLink && shareLink(botLink, t("referral.shareText"))}
            disabled={!botLink}
          >
            {t("referral.share")}
          </button>
        </div>
      </div>

      {/* Metabox referral link */}
      <div className="referral-card">
        <div className="referral-card__type">{t("referral.metaboxLink")}</div>
        <div className="referral-card__label">{t("referral.metaboxLinkHint")}</div>
        {metaboxLink ? (
          <>
            <div className="referral-card__link">{metaboxLink}</div>
            <div className="referral-card__actions">
              <button
                className="btn btn--secondary"
                onClick={() => metaboxCopy.copy(metaboxLink)}
              >
                {metaboxCopy.copied ? t("referral.copied") : t("referral.copy")}
              </button>
              <button
                className="btn btn--primary"
                onClick={() => shareLink(metaboxLink, t("referral.shareText"))}
              >
                {t("referral.share")}
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn--secondary referral-card__link-cta" onClick={onLinkMetabox}>
            {t("referral.metaboxLinkCta")}
          </button>
        )}
      </div>

      <div className="referral-how">
        <div className="section-title">{t("referral.howTitle")}</div>
        <ol className="referral-steps">
          <li>{t("referral.step1")}</li>
          <li>{t("referral.step2")}</li>
          <li>{t("referral.step3")}</li>
        </ol>
      </div>
    </div>
  );
}
