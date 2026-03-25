import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { CatalogResponse, CatalogSubscription, CatalogTokenPackage } from "../types.js";

type Period = "M1" | "M3" | "M6" | "M12";
const ALL_PERIODS: Period[] = ["M1", "M3", "M6", "M12"];
const PERIOD_MONTHS: Record<Period, number> = { M1: 1, M3: 3, M6: 6, M12: 12 };

const BADGE_LABELS: Record<string, string> = {
  top: "🔥 Топ",
  profitable: "💎 Выгодно",
  best_value: "💎 Выгодно",
};

type TgWebApp = {
  openInvoice?: (url: string, cb?: (status: string) => void) => void;
  openLink?: (url: string) => void;
};

function getTgWebApp(): TgWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

interface ModalState {
  type: "product" | "subscription";
  id: string;
  name: string;
  tokens: number;
  priceRub: string;
  stars: number;
  period?: Period;
}

export function TariffsPage() {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("M1");
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    Promise.all([api.tariffs.catalog(), api.profile.get()])
      .then(([cat, prof]) => {
        setCatalog(cat);
        setBalance(prof.tokenBalance);
      })
      .catch(() => void 0);
  }, []);

  // Compute available periods from subscriptions (union of all available periods)
  const availablePeriods = useMemo<Period[]>(() => {
    if (!catalog || catalog.subscriptions.length === 0) return ["M1"];
    const set = new Set<Period>();
    for (const sub of catalog.subscriptions) {
      for (const p of ALL_PERIODS) {
        if (sub.periods[p]) set.add(p);
      }
    }
    return ALL_PERIODS.filter((p) => set.has(p));
  }, [catalog]);

  // Reset period to M1 if the current selection is no longer available
  useEffect(() => {
    if (!availablePeriods.includes(period)) {
      setPeriod("M1");
    }
  }, [availablePeriods, period]);

  const openModal = (state: ModalState) => {
    setModal(state);
    setNotice(null);
  };

  const handleStarsPay = async () => {
    if (!modal || buying) return;
    setBuying(true);
    setNotice(null);

    try {
      const { invoiceUrl } = await api.payments.createInvoice(modal.type, modal.id, modal.period);
      const tg = getTgWebApp();
      if (!tg?.openInvoice) {
        setNotice({ text: t("tariffs.openInTg"), ok: false });
        return;
      }
      tg.openInvoice(invoiceUrl, (status) => {
        if (status === "paid") {
          setNotice({ text: `\u2705 ${modal.tokens} ${t("tariffs.success")}`, ok: true });
          setModal(null);
          api.profile
            .get()
            .then((p) => setBalance(p.tokenBalance))
            .catch(() => void 0);
        } else if (status !== "cancelled") {
          setNotice({ text: t("tariffs.failed"), ok: false });
        }
      });
    } catch {
      setNotice({ text: t("tariffs.invoiceError"), ok: false });
    } finally {
      setBuying(false);
    }
  };

  const handleCardPay = async () => {
    if (!modal || buying) return;
    setBuying(true);
    setNotice(null);

    try {
      const { paymentUrl } = await api.payments.createCardInvoice(
        modal.type,
        modal.id,
        modal.period,
      );
      const tg = getTgWebApp();
      if (tg?.openLink) {
        tg.openLink(paymentUrl);
      } else {
        window.open(paymentUrl, "_blank");
      }
      setModal(null);
    } catch {
      setNotice({ text: t("tariffs.invoiceError"), ok: false });
    } finally {
      setBuying(false);
    }
  };

  const openSubModal = (sub: CatalogSubscription) => {
    const p = sub.periods[period];
    if (!p) return;
    const months = PERIOD_MONTHS[period];
    openModal({
      type: "subscription",
      id: sub.id,
      name: sub.name,
      tokens: sub.tokens * months,
      priceRub: p.priceRub,
      stars: p.stars,
      period,
    });
  };

  const openPkgModal = (pkg: CatalogTokenPackage) => {
    openModal({
      type: "product",
      id: pkg.id,
      name: pkg.name,
      tokens: pkg.tokens,
      priceRub: pkg.priceRub,
      stars: pkg.stars,
    });
  };

  if (!catalog) {
    return <div className="page-loading">{t("tariffs.buying")}</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("tariffs.title")}</h2>
        {balance !== null && (
          <p className="page-subtitle">
            {t("tariffs.currentBalance")}: {"⚡"} {Number(balance).toFixed(2)} {t("tariffs.tokens")}
          </p>
        )}
        <p className="page-subtitle">{t("tariffs.description")}</p>
      </div>

      {notice && (
        <div
          className={`payment-notice${notice.ok ? " payment-notice--ok" : " payment-notice--err"}`}
        >
          {notice.text}
        </div>
      )}

      {/* ── Subscriptions ──────────────────────────────────────────────── */}
      {catalog.subscriptions.length > 0 && (
        <>
          <h3 className="section-title">{t("tariffs.subscriptions")}</h3>

          {availablePeriods.length > 1 && (
            <div className="period-selector">
              {availablePeriods.map((p) => (
                <button
                  key={p}
                  className={`period-selector__btn${p === period ? " period-selector__btn--active" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  {t(`tariffs.period.${p}`)}
                </button>
              ))}
            </div>
          )}

          <div className="plans-grid">
            {catalog.subscriptions.map((sub) => {
              const p = sub.periods[period];
              if (!p) return null;
              const months = PERIOD_MONTHS[period];
              return (
                <div key={sub.id} className="plan-card">
                  <div className="plan-card__label">{sub.name}</div>
                  <div className="plan-card__tokens">{"⚡"} {(sub.tokens * months).toLocaleString("ru-RU")} токенов</div>
                  <div className="plan-card__price">
                    {Number(p.priceRub).toLocaleString("ru-RU")} {"₽"}
                  </div>
                  <button className="plan-card__btn" onClick={() => openSubModal(sub)}>
                    {t("tariffs.buy")}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Token Packages ─────────────────────────────────────────────── */}
      {catalog.tokenPackages.length > 0 && (
        <>
          <h3 className="section-title">{t("tariffs.tokenPackages")}</h3>

          <div className="plans-grid">
            {catalog.tokenPackages.map((pkg) => (
              <div key={pkg.id} className={`plan-card${pkg.badge ? " plan-card--popular" : ""}`}>
                {pkg.badge && (
                  <div className="plan-card__badge">{BADGE_LABELS[pkg.badge] ?? pkg.badge}</div>
                )}
                <div className="plan-card__label">{pkg.name}</div>
                <div className="plan-card__tokens">{"⚡"} {pkg.tokens.toLocaleString("ru-RU")} токенов</div>
                <div className="plan-card__price">
                  {Number(pkg.priceRub).toLocaleString("ru-RU")} {"₽"}
                </div>
                <button className="plan-card__btn" onClick={() => openPkgModal(pkg)}>
                  {t("tariffs.buy")}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="tariff-note">
        {t("tariffs.note")}
        <br />
        {t("tariffs.note2")}
      </div>

      {/* ── Payment Modal ──────────────────────────────────────────────── */}
      {modal && (
        <div className="payment-modal" onClick={() => !buying && setModal(null)}>
          <div className="payment-modal__card" onClick={(e) => e.stopPropagation()}>
            <button className="payment-modal__close" onClick={() => !buying && setModal(null)}>
              {"✕"}
            </button>

            <h3 className="payment-modal__title">{t("tariffs.choosePayment")}</h3>

            <div className="payment-modal__product">
              <span className="payment-modal__product-name">{modal.name}</span>
              <span className="payment-modal__product-tokens">{"⚡"} {modal.tokens}</span>
              <span className="payment-modal__product-price">
                {Number(modal.priceRub).toLocaleString("ru-RU")} {"₽"}
              </span>
            </div>

            <div className="payment-modal__options">
              {catalog.canPayByCard ? (
                <button
                  className="payment-modal__option payment-modal__option--card"
                  onClick={handleCardPay}
                  disabled={buying}
                >
                  <span className="payment-modal__option-icon">\uD83D\uDCB3</span>
                  <span className="payment-modal__option-label">{t("tariffs.payByCard")}</span>
                  <span className="payment-modal__option-price">
                    {Number(modal.priceRub).toLocaleString("ru-RU")} {"₽"}
                  </span>
                </button>
              ) : (
                <div className="payment-modal__link-hint">
                  <p>{t("tariffs.linkRequired")}</p>
                </div>
              )}

              <button
                className="payment-modal__option payment-modal__option--stars"
                onClick={handleStarsPay}
                disabled={buying}
              >
                <span className="payment-modal__option-icon">\u2B50</span>
                <span className="payment-modal__option-label">{t("tariffs.payByStars")}</span>
                <span className="payment-modal__option-price">{modal.stars} Stars</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
