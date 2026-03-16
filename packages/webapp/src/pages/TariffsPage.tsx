import { useEffect, useState } from "react";
import { api } from "../api/client.js";

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
        setNotice({ text: "Open this page inside Telegram to pay with Stars.", ok: false });
        return;
      }

      tg.openInvoice(invoiceUrl, (status) => {
        if (status === "paid") {
          setNotice({ text: `✅ ${plan.tokens} tokens credited to your balance!`, ok: true });
          // Refresh balance
          api.profile
            .get()
            .then((p) => setBalance(p.tokenBalance))
            .catch(() => void 0);
        } else if (status === "cancelled") {
          setNotice(null);
        } else {
          setNotice({ text: "Payment failed. Please try again.", ok: false });
        }
      });
    } catch {
      setNotice({ text: "Could not create invoice. Please try again.", ok: false });
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Token Packages</h2>
        {balance !== null && (
          <p className="page-subtitle">Current balance: ⚡ {Number(balance).toFixed(2)} tokens</p>
        )}
        <p className="page-subtitle">
          Tokens are used for all AI requests. 1 token ≈ 1 image or 50 GPT messages.
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
            {plan.popular && <div className="plan-card__badge">Popular</div>}
            <div className="plan-card__label">{plan.label}</div>
            <div className="plan-card__tokens">✦ {plan.tokens}</div>
            <div className="plan-card__price">{plan.stars} ⭐</div>
            <button
              className="plan-card__btn"
              onClick={() => handleBuy(plan)}
              disabled={buying !== null}
            >
              {buying === plan.id ? "…" : "Buy"}
            </button>
          </div>
        ))}
      </div>

      <div className="tariff-note">
        Payments are processed securely via Telegram Stars.
        <br />
        Tokens are credited instantly after payment.
      </div>
    </div>
  );
}
