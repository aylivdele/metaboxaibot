const PLANS = [
  { tokens: 10, stars: 50, label: "Starter", popular: false },
  { tokens: 50, stars: 200, label: "Basic", popular: false },
  { tokens: 150, stars: 500, label: "Pro", popular: true },
  { tokens: 400, stars: 1200, label: "Business", popular: false },
  { tokens: 1000, stars: 2500, label: "Enterprise", popular: false },
];

export function TariffsPage() {
  const handleBuy = (stars: number, tokens: number) => {
    // Telegram Stars payment via WebApp.openInvoice
    const tg = (
      window as Window & {
        Telegram?: {
          WebApp?: { openInvoice?: (url: string, cb?: (status: string) => void) => void };
        };
      }
    ).Telegram?.WebApp;

    if (!tg?.openInvoice) {
      alert(`To purchase ${tokens} tokens for ${stars} ⭐, please use the bot's /buy command.`);
      return;
    }

    // In production: request invoice URL from backend, then:
    // tg.openInvoice(invoiceUrl, (status) => { if (status === "paid") reload() })
    alert(`Payment for ${tokens} tokens (${stars} ⭐) will be available soon.`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>💳 Token Packages</h2>
        <p className="page-subtitle">
          Tokens are used for all AI requests. 1 token ≈ 1 image or 50 GPT messages.
        </p>
      </div>

      <div className="plans-grid">
        {PLANS.map((plan) => (
          <div
            key={plan.tokens}
            className={`plan-card${plan.popular ? " plan-card--popular" : ""}`}
          >
            {plan.popular && <div className="plan-card__badge">⭐ Popular</div>}
            <div className="plan-card__label">{plan.label}</div>
            <div className="plan-card__tokens">⚡ {plan.tokens} tokens</div>
            <div className="plan-card__price">{plan.stars} ⭐ Stars</div>
            <button className="plan-card__btn" onClick={() => handleBuy(plan.stars, plan.tokens)}>
              Buy
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
