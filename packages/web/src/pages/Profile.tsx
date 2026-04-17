import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Shield, Send, LogOut, Check, X } from "lucide-react";
import clsx from "clsx";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { changePassword, unlinkTelegram } from "@/api/auth";
import { ApiError } from "@/api/client";

type Section = "profile" | "security" | "integrations" | "language";

const sections: Array<{ id: Section; label: string; icon: typeof User }> = [
  { id: "profile", label: "Профиль", icon: User },
  { id: "security", label: "Безопасность", icon: Shield },
  { id: "integrations", label: "Интеграции", icon: Send },
];

export default function Profile() {
  const [active, setActive] = useState<Section>("profile");
  const { user, logout } = useAuthStore();

  return (
    <div className="p-4 md:p-6 anim-page-in max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Профиль</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Nav */}
        <nav className="md:w-60 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={clsx(
                  "flex items-center gap-3 px-3 h-10 rounded text-sm font-medium transition-colors shrink-0",
                  isActive
                    ? "bg-bg-elevated text-text"
                    : "text-text-secondary hover:bg-bg-secondary hover:text-text",
                )}
              >
                <Icon size={16} />
                <span>{s.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 h-10 rounded text-sm font-medium text-text-secondary hover:bg-bg-secondary hover:text-danger transition-colors shrink-0 mt-2"
          >
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {active === "profile" && <ProfileSection />}
          {active === "security" && <SecuritySection />}
          {active === "integrations" && <IntegrationsSection />}
        </div>
      </div>

      <div className="text-xs text-text-hint mt-8 text-center">
        ID: {user?.metaboxUserId ?? "—"}
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

function ProfileSection() {
  const { user } = useAuthStore();
  return (
    <div className="card p-5 md:p-6 space-y-5">
      <Field label="Email" value={user?.email ?? "—"} />
      <Field label="Имя" value={user?.firstName ?? "—"} />
      <Field label="Фамилия" value={user?.lastName ?? "—"} />
      <Field
        label="Telegram"
        value={user?.telegramUsername ? `@${user.telegramUsername}` : "не привязан"}
      />
      <Field
        label="Баланс токенов"
        value={`${user?.tokenBalance ?? "0"} (${user?.subscriptionTokenBalance ?? "0"} из подписки)`}
      />
    </div>
  );
}

const securitySchema = z
  .object({
    oldPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: z.string().min(8, "Минимум 8 символов").max(128, "Слишком длинно"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Пароли не совпадают",
  });
type SecurityValues = z.infer<typeof securitySchema>;

function SecuritySection() {
  const pushToast = useUIStore((s) => s.pushToast);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SecurityValues>({ resolver: zodResolver(securitySchema) });

  const onSubmit = async (v: SecurityValues) => {
    setServerError(null);
    try {
      await changePassword(v.oldPassword, v.newPassword);
      pushToast({ type: "success", message: "Пароль обновлён" });
      reset();
    } catch (err) {
      if (err instanceof ApiError) setServerError(err.message);
      else setServerError("Не удалось сменить пароль");
    }
  };

  return (
    <div className="card p-5 md:p-6">
      <h2 className="font-semibold mb-4">Смена пароля</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-md">
        <Input
          label="Текущий пароль"
          togglePassword
          autoComplete="current-password"
          error={errors.oldPassword?.message}
          {...register("oldPassword")}
        />
        <Input
          label="Новый пароль"
          togglePassword
          autoComplete="new-password"
          hint="Не короче 8 символов"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Input
          label="Повторите пароль"
          togglePassword
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        {serverError && (
          <div
            className="rounded-sm px-3 py-2 text-sm"
            style={{
              background: "var(--danger-bg)",
              color: "var(--danger)",
              borderLeft: "3px solid var(--danger)",
            }}
          >
            {serverError}
          </div>
        )}
        <Button type="submit" loading={isSubmitting}>
          Сохранить
        </Button>
      </form>
    </div>
  );
}

function IntegrationsSection() {
  const { user, setUser } = useAuthStore();
  const openTelegramLinkModal = useUIStore((s) => s.openTelegramLinkModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);

  const onUnlink = async () => {
    if (!confirm("Отвязать Telegram от аккаунта? История диалогов останется в боте.")) return;
    setBusy(true);
    try {
      await unlinkTelegram();
      if (user) {
        setUser({
          ...user,
          telegramId: null,
          telegramUsername: null,
          isTelegramLinked: false,
          id: null,
        });
      }
      pushToast({ type: "success", message: "Telegram отвязан" });
    } catch {
      pushToast({ type: "error", message: "Не удалось отвязать" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 md:p-6 space-y-4">
      <h2 className="font-semibold">Telegram-бот</h2>
      <p className="text-sm text-text-secondary">
        Привязка Telegram открывает доступ к нейросетям, истории диалогов и галерее
        генераций. Баланс и подписка синхронизируются с ботом.
      </p>

      <div className="flex items-center gap-3 p-4 rounded bg-bg-elevated">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(42, 171, 238, 0.15)" }}
        >
          <Send size={20} className="text-[#2AABEE]" />
        </div>
        <div className="flex-1 min-w-0">
          {user?.isTelegramLinked ? (
            <>
              <div className="text-sm font-medium flex items-center gap-2">
                <Check size={16} className="text-success" />
                Привязан{user?.telegramUsername ? ` (@${user.telegramUsername})` : ""}
              </div>
              <div className="text-xs text-text-hint mt-0.5">
                История диалогов и баланс общие с ботом.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium flex items-center gap-2">
                <X size={16} className="text-danger" />
                Не привязан
              </div>
              <div className="text-xs text-text-hint mt-0.5">
                Для работы с нейросетями необходима привязка.
              </div>
            </>
          )}
        </div>
        {user?.isTelegramLinked ? (
          <Button variant="secondary" size="sm" onClick={onUnlink} loading={busy}>
            Отвязать
          </Button>
        ) : (
          <Button size="sm" onClick={() => openTelegramLinkModal()}>
            Привязать
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-hint uppercase tracking-wide mb-1">{label}</div>
      <div className="text-text">{value}</div>
    </div>
  );
}
