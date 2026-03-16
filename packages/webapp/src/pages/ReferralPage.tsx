import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? "MetaboxAIBot";

export function ReferralPage() {
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
        <h2>Referral Program</h2>
        <p className="page-subtitle">
          Invite friends and earn tokens for every new user who joins via your link.
        </p>
      </div>

      <div className="referral-stats">
        <div className="referral-stat">
          <div className="referral-stat__value">{referralCount}</div>
          <div className="referral-stat__label">Friends invited</div>
        </div>
        <div className="referral-stat">
          <div className="referral-stat__value">0.5</div>
          <div className="referral-stat__label">Tokens per referral</div>
        </div>
      </div>

      <div className="referral-card">
        <div className="referral-card__label">Your referral link</div>
        <div className="referral-card__link">{referralLink ?? "Loading…"}</div>
        <div className="referral-card__actions">
          <button className="btn btn--secondary" onClick={handleCopy} disabled={!referralLink}>
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
          <button className="btn btn--primary" onClick={handleShare} disabled={!referralLink}>
            Share
          </button>
        </div>
      </div>

      <div className="referral-how">
        <div className="section-title">How it works</div>
        <ol className="referral-steps">
          <li>Share your unique link with friends</li>
          <li>Friend opens the bot via your link</li>
          <li>You both receive bonus tokens</li>
        </ol>
      </div>
    </div>
  );
}
