import { useEffect, useState } from "react";
import { Sparkles, Coins } from "lucide-react";
import { getCatalog, createTokensOrder, type TokenPackDto } from "@/api/billing";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { ApiError } from "@/api/client";

export default function Tokens() {
  const isTelegramLinked = useAuthStore((s) => !!s.user?.isTelegramLinked);
  const openTelegramLinkModal = useUIStore((s) => s.openTelegramLinkModal);
  const pushToast = useUIStore((s) => s.pushToast);

  const [packs, setPacks] = useState<TokenPackDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isTelegramLinked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getCatalog()
      .then((c) => setPacks(c.tokenPackages))
      .catch(() => pushToast({ type: "error", message: "Не удалось загрузить пакеты" }))
      .finally(() => setLoading(false));
  }, [isTelegramLinked, pushToast]);

  const onBuy = async (pack: TokenPackDto) => {
    setBuyingId(pack.id);
    try {
      const { paymentUrl } = await createTokensOrder(pack.id);
      window.location.href = paymentUrl;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code !== "TELEGRAM_NOT_LINKED")
          pushToast({ type: "error", message: err.message });
      } else {
        pushToast({ type: "error", message: "Ошибка оплаты" });
      }
      setBuyingId(null);
    }
  };

  if (!isTelegramLinked) {
    return (
      <div className="p-6 anim-page-in max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-3">Токены</h1>
        <div className="card p-5 text-center">
          <Sparkles size={32} className="text-accent mx-auto mb-3" />
          <p className="text-text-secondary mb-4">
            Чтобы докупать токены, привяжите Telegram-бот.
          </p>
          <Button onClick={() => openTelegramLinkModal("купить токены")}>
            Привязать Telegram
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 anim-page-in max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Дополнительные токены</h1>
      <p className="text-text-secondary mb-6">
        Не хватает токенов подписки? Докупите пакет, он зачислится сразу после оплаты.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 h-48 skeleton" />
          ))}
        </div>
      ) : !packs || packs.length === 0 ? (
        <div className="card p-8 text-center text-text-secondary">
          Пакеты токенов временно недоступны
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map((p) => (
            <div
              key={p.id}
              className="card p-5 flex flex-col"
              style={p.badge ? { borderColor: "var(--accent)" } : undefined}
            >
              {p.badge && (
                <div className="inline-flex self-start mb-2 px-2 py-0.5 rounded-sm bg-accent-gradient text-white text-[11px] font-bold uppercase tracking-wide">
                  {p.badge}
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Coins size={18} className="text-accent" />
                <span className="text-sm text-text-secondary">{p.name}</span>
              </div>
              <div className="text-2xl font-bold">
                {p.tokens.toLocaleString("ru-RU")}
                <span className="text-sm text-text-secondary font-normal"> токенов</span>
              </div>
              <div className="text-lg text-text mt-1">
                {Math.round(Number(p.priceRub))} ₽
              </div>
              <Button
                fullWidth
                className="mt-4"
                onClick={() => onBuy(p)}
                loading={buyingId === p.id}
              >
                Купить
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
