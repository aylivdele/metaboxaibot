import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import clsx from "clsx";
import { getCatalog, createSubscriptionOrder, type PlanDto } from "@/api/billing";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { ApiError } from "@/api/client";

type Period = "M1" | "M3" | "M6" | "M12";

const periodLabels: Record<Period, string> = {
  M1: "Месяц",
  M3: "3 месяца",
  M6: "6 месяцев",
  M12: "Год",
};

export default function Plans() {
  const isTelegramLinked = useAuthStore((s) => !!s.user?.isTelegramLinked);
  const openTelegramLinkModal = useUIStore((s) => s.openTelegramLinkModal);
  const pushToast = useUIStore((s) => s.pushToast);

  const [period, setPeriod] = useState<Period>("M1");
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!isTelegramLinked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getCatalog()
      .then((c) => setPlans(c.subscriptions))
      .catch(() => pushToast({ type: "error", message: "Не удалось загрузить тарифы" }))
      .finally(() => setLoading(false));
  }, [isTelegramLinked, pushToast]);

  const availablePeriods: Period[] =
    plans && plans.length > 0 ? (Object.keys(plans[0].periods) as Period[]) : ["M1"];

  const onBuy = async (plan: PlanDto) => {
    if (!plan.periods[period]) return;
    setBuyingPlanId(plan.id);
    try {
      const { paymentUrl, orderId } = await createSubscriptionOrder(plan.id, period);
      window.location.href = paymentUrl.includes("?")
        ? `${paymentUrl}&_order=${orderId}`
        : paymentUrl;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code !== "TELEGRAM_NOT_LINKED") pushToast({ type: "error", message: err.message });
      } else {
        pushToast({ type: "error", message: "Ошибка оплаты" });
      }
      setBuyingPlanId(null);
    }
  };

  if (!isTelegramLinked) {
    return (
      <div className="p-6 anim-page-in max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-3">Тарифы</h1>
        <div className="card p-5 text-center">
          <Sparkles size={32} className="text-accent mx-auto mb-3" />
          <p className="text-text-secondary mb-4">
            Чтобы покупать подписки, привяжите Telegram-бот.
          </p>
          <Button onClick={() => openTelegramLinkModal("оформить подписку")}>
            Привязать Telegram
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 anim-page-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Тарифы</h1>
        <div className="flex gap-1 p-1 rounded-full bg-bg-elevated">
          {availablePeriods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={clsx(
                "px-3 h-8 rounded-full text-xs font-semibold transition-colors",
                period === p
                  ? "bg-accent-gradient text-white"
                  : "text-text-secondary hover:text-text",
              )}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 h-[360px] skeleton" />
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <div className="card p-8 text-center text-text-secondary">Тарифы временно недоступны</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, idx) => {
            const periodData = plan.periods[period];
            if (!periodData) return null;
            const highlighted = idx === 1;
            return (
              <div
                key={plan.id}
                className={clsx("card p-6 flex flex-col", highlighted && "!border-accent")}
                style={highlighted ? { boxShadow: "var(--shadow-accent)" } : undefined}
              >
                {highlighted && (
                  <div className="inline-flex self-start mb-2 px-2 py-1 rounded-sm bg-accent-gradient text-white text-[11px] font-bold uppercase tracking-wide">
                    Рекомендуем
                  </div>
                )}
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{periodData.priceRub}</span>
                  <span className="text-sm text-text-secondary">₽</span>
                  {periodData.discountPct > 0 && (
                    <span className="ml-auto text-xs text-success font-semibold">
                      −{periodData.discountPct}%
                    </span>
                  )}
                </div>
                <div className="text-sm text-text-secondary mt-1">{periodLabels[period]}</div>

                <div className="h-px bg-border my-5" />

                <ul className="flex flex-col gap-2.5 text-sm flex-1">
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success shrink-0" />
                    <span>{plan.tokens.toLocaleString("ru-RU")} токенов в месяц</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success shrink-0" />
                    <span>Все модели AI Box</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success shrink-0" />
                    <span>Единая история с ботом</span>
                  </li>
                </ul>

                <Button
                  onClick={() => onBuy(plan)}
                  loading={buyingPlanId === plan.id}
                  variant={highlighted ? "primary" : "secondary"}
                  fullWidth
                  className="mt-6"
                >
                  Выбрать
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
