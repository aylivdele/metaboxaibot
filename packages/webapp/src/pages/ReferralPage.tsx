import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { UserProfile } from "../types.js";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? "MetaboxAIBot";
const METABOX_APP_URL =
  (import.meta.env.VITE_METABOX_APP_URL as string | undefined) ?? "https://app.metabox.global";
const names = METABOX_APP_URL.split(".");
let LANDING_URL = "metabox.global";
if (names.length > 1) {
  LANDING_URL = `${names.at(-2)}.${names.at(-1)}`;
}

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

function fmtRub(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
}

export function ReferralPage({ onLinkMetabox }: { onLinkMetabox: () => void }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerData, setPartnerData] = useState<{
    balance: number;
    totalEarned: number;
    totalWithdrawn: number;
    userStatus: string;
    referralCode: string | null;
  } | null>(null);

  useEffect(() => {
    api.profile.get().then(setProfile).catch(console.error);
    api.profile.partnerBalance().then(setPartnerData).catch(console.error);
  }, []);

  const referralCode = partnerData?.referralCode || profile?.metaboxReferralCode;
  const botLink = referralCode ? `https://t.me/${BOT_USERNAME}?start=ref_${referralCode}` : null;
  const metaboxLink = referralCode ? `${METABOX_APP_URL}/register/?promo=${referralCode}` : null;

  const botCopy = useCopy();
  const metaboxCopy = useCopy();

  const isLinked = !!profile?.metaboxUserId;
  const hasPlaceholderEmail = profile?.metaboxUserId && !profile.metaboxReferralCode;

  const minReward = 290;

  const handleWithdraw = async () => {
    if (!isLinked || hasPlaceholderEmail) {
      onLinkMetabox();
      return;
    }
    try {
      const result = await api.profile.metaboxSso();
      // Email ещё не подтверждён — отправляем юзера на pending-экран
      // в LinkMetaboxPage [там кнопки «Отправить повторно» / «Изменить»].
      if ("requiresVerification" in result && result.requiresVerification) {
        onLinkMetabox();
        return;
      }
      if ("ssoUrl" in result && result.ssoUrl) {
        const financeUrl = result.ssoUrl.includes("?")
          ? `${result.ssoUrl}&redirect=/partner/finance`
          : `${result.ssoUrl}?redirect=/partner/finance`;
        window.open(financeUrl, "_blank");
      }
    } catch {
      // Fallback
      onLinkMetabox();
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("referral.partnerTitle")}</h2>
      </div>

      {/* Partner balance */}
      <div className="partner-balance-card">
        <div className="partner-balance-card__label">{t("referral.partnerBalance")}</div>
        <div className="partner-balance-card__value">
          {partnerData ? fmtRub(partnerData.balance) : "—"}
        </div>
        {partnerData && partnerData.totalEarned > 0 && (
          <div className="partner-balance-card__earned">
            {t("referral.totalEarned")}: {fmtRub(partnerData.totalEarned)}
          </div>
        )}
        <button
          className="btn btn--primary partner-balance-card__withdraw"
          onClick={handleWithdraw}
        >
          {t("referral.withdraw")}
        </button>
      </div>

      {/* Stats */}
      <div className="referral-stats">
        <div className="referral-stat">
          <div className="referral-stat__value">{profile?.referralCount ?? "—"}</div>
          <div className="referral-stat__label">{t("referral.invited")}</div>
        </div>
        <div className="referral-stat">
          <div className="referral-stat__value referral-stat__value--small">
            {t("referral.rewardFrom")}&nbsp;{minReward.toLocaleString()}&nbsp;₽
          </div>
          <div className="referral-stat__label">{t("referral.rewardPerSub")}</div>
        </div>
      </div>

      {/* Info about rewards */}
      <div className="referral-info">
        <p>{t("referral.rewardInfo").replace("{landing_url}", LANDING_URL)}</p>
      </div>

      {/* Bot referral link */}
      {botLink && (
        <div className="referral-card">
          <div className="referral-card__type">{t("referral.botLink")}</div>
          <div className="referral-card__label">{t("referral.botLinkHint")}</div>
          <div className="referral-card__link">{botLink}</div>
          <div className="referral-card__actions">
            <button className="btn btn--secondary" onClick={() => botCopy.copy(botLink)}>
              {botCopy.copied ? t("referral.copied") : t("referral.copy")}
            </button>
            <button
              className="btn btn--primary"
              onClick={() => shareLink(botLink, t("referral.shareText"))}
            >
              {t("referral.share")}
            </button>
          </div>
        </div>
      )}

      {/* Metabox referral link */}
      <div className="referral-card">
        <div className="referral-card__type">{t("referral.metaboxLink")}</div>
        <div className="referral-card__label">{t("referral.metaboxLinkHint")}</div>
        {metaboxLink ? (
          <>
            <div className="referral-card__link">{metaboxLink}</div>
            <div className="referral-card__actions">
              <button className="btn btn--secondary" onClick={() => metaboxCopy.copy(metaboxLink)}>
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
    </div>
  );
}
