import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";

interface Plan {
  id: string;
  label: string;
  tokens: number;
  stars: number;
  popular: boolean;
}

const PLANS: Plan[] = [
  { id: "starter", label: "Starter", tokens: 10, stars: 50, popular: false },
  { id: "basic", label: "Basic", tokens: 50, stars: 200, popular: false },
  { id: "pro", label: "Pro", tokens: 150, stars: 500, popular: true },
  { id: "business", label: "Business", tokens: 400, stars: 1200, popular: false },
  { id: "enterprise", label: "Enterprise", tokens: 1000, stars: 2500, popular: false },
];

type TgWebApp = {
  openInvoice?: (url: string, cb?: (status: string) => void) => void;
};

function getTgWebApp(): TgWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

export function TariffsPage() {
  const { t } = useI18n();
  const [balance, setBalance] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.profile
      .get()
      .then((p) => setBalance(p.tokenBalance))
      .catch(() => void 0);
  }, []);

  const handleBuy = async (plan: Plan) => {
    if (buying) return;
    setBuying(plan.id);
    setNotice(null);

    try {
      const { invoiceUrl } = await api.payments.createInvoice(plan.id);
      const tg = getTgWebApp();

      if (!tg?.openInvoice) {
        setNotice({ text: t("tariffs.openInTg"), ok: false });
        return;
      }

      tg.openInvoice(invoiceUrl, (status) => {
        if (status === "paid") {
          setNotice({ text: `✅ ${plan.tokens} ${t("tariffs.success")}`, ok: true });
          // Refresh balance
          api.profile
            .get()
            .then((p) => setBalance(p.tokenBalance))
            .catch(() => void 0);
        } else if (status === "cancelled") {
          setNotice(null);
        } else {
          setNotice({ text: t("tariffs.failed"), ok: false });
        }
      });
    } catch {
      setNotice({ text: t("tariffs.invoiceError"), ok: false });
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("tariffs.title")}</h2>
        {balance !== null && (
          <p className="page-subtitle">
            {t("tariffs.currentBalance")}: ✦ {Number(balance).toFixed(2)}{" "}
            {t("tariffs.tokens")}
          </p>
        )}
        <p className="page-subtitle">
          {t("tariffs.description")}
        </p>
      </div>

      {notice && (
        <div
          className={`payment-notice${notice.ok ? " payment-notice--ok" : " payment-notice--err"}`}
        >
          {notice.text}
        </div>
      )}

      <div className="plans-grid">
        {PLANS.map((plan) => (
          <div key={plan.id} className={`plan-card${plan.popular ? " plan-card--popular" : ""}`}>
            {plan.popular && <div className="plan-card__badge">{t("tariffs.popular")}</div>}
            <div className="plan-card__label">{plan.label}</div>
            <div className="plan-card__tokens">✦ {plan.tokens}</div>
            <div className="plan-card__price">{plan.stars} ⭐</div>
            <button
              className="plan-card__btn"
              onClick={() => handleBuy(plan)}
              disabled={buying !== null}
            >
              {buying === plan.id ? t("tariffs.buying") : t("tariffs.buy")}
            </button>
          </div>
        ))}
      </div>

      <div className="tariff-note">
        {t("tariffs.note")}
        <br />
        {t("tariffs.note2")}
      </div>
    </div>
  );
}
