import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import { BannerSlider } from "../components/BannerSlider.js";
import type { UserProfile } from "../types.js";

const REASON_KEYS: Record<string, string> = {
  welcome_bonus: "profile.reason.welcome_bonus",
  ai_usage: "profile.reason.ai_usage",
  purchase: "profile.reason.purchase",
  referral_bonus: "profile.reason.referral_bonus",
  admin: "profile.reason.admin",
};

export function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.profile
      .get()
      .then(setProfile)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">{t("common.loading")}</div>;
  if (error) return <div className="page-error">❌ {error}</div>;
  if (!profile) return null;

  const displayName = profile.firstName ?? profile.username ?? `User ${profile.id.slice(-4)}`;

  return (
    <div className="page">
      <BannerSlider />

      <div className="profile-header">
        <div className="profile-avatar">{displayName[0].toUpperCase()}</div>
        <div className="profile-name">{displayName}</div>
        {profile.username && <div className="profile-username">@{profile.username}</div>}
      </div>

      <div className="balance-card">
        <div className="balance-card__label">{t("profile.balance")}</div>
        <div className="balance-card__amount">✦ {Number(profile.tokenBalance).toFixed(2)}</div>
        <div className="balance-card__sub">{t("profile.referrals")}: {profile.referralCount}</div>
      </div>

      <div className="section-title">{t("profile.txHistory")}</div>
      {profile.transactions.length === 0 ? (
        <div className="empty-state">{t("profile.noTx")}</div>
      ) : (
        <ul className="tx-list">
          {profile.transactions.map((tx) => (
            <li key={tx.id} className="tx-item">
              <div className="tx-item__info">
                <span className="tx-item__reason">
                  {REASON_KEYS[tx.reason] ? t(REASON_KEYS[tx.reason] as any) : tx.reason}
                </span>
                {tx.modelId && <span className="tx-item__model">{tx.modelId}</span>}
                <span className="tx-item__date">{new Date(tx.createdAt).toLocaleDateString()}</span>
              </div>
              <span className={`tx-item__amount tx-item__amount--${tx.type}`}>
                {tx.type === "credit" ? "+" : "−"}
                {Math.abs(Number(tx.amount)).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
