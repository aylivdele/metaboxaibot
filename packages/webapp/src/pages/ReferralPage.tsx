import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? "MetaboxAIBot";

export function ReferralPage() {
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.profile
      .get()
      .then((p) => {
        setUserId(p.id);
        setReferralCount(p.referralCount);
      })
      .catch(console.error);
  }, []);

  const referralLink = userId ? `https://t.me/${BOT_USERNAME}?start=${userId}` : null;

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    if (!referralLink) return;
    const tg = (
      window as Window & { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }
    ).Telegram?.WebApp;

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Try Metabox — 70+ AI tools in one Telegram bot! 🚀")}`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("referral.title")}</h2>
        <p className="page-subtitle">{t("referral.subtitle")}</p>
      </div>

      <div className="referral-stats">
        <div className="referral-stat">
          <div className="referral-stat__value">{referralCount}</div>
          <div className="referral-stat__label">{t("referral.invited")}</div>
        </div>
        <div className="referral-stat">
          <div className="referral-stat__value">0.5</div>
          <div className="referral-stat__label">{t("referral.perReferral")}</div>
        </div>
      </div>

      <div className="referral-card">
        <div className="referral-card__label">{t("referral.yourLink")}</div>
        <div className="referral-card__link">{referralLink ?? t("common.loading")}</div>
        <div className="referral-card__actions">
          <button className="btn btn--secondary" onClick={handleCopy} disabled={!referralLink}>
            {copied ? t("referral.copied") : t("referral.copy")}
          </button>
          <button className="btn btn--primary" onClick={handleShare} disabled={!referralLink}>
            {t("referral.share")}
          </button>
        </div>
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
