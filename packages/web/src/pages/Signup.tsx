import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { signup as signupApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

const schema = z
  .object({
    firstName: z.string().min(1, "Укажите имя").max(100, "Слишком длинно"),
    email: z.string().min(1, "Укажите email").email("Некорректный email"),
    password: z.string().min(8, "Минимум 8 символов").max(128, "Слишком длинно"),
    confirmPassword: z.string(),
    referralCode: z.string().optional(),
    agree: z.literal(true, {
      errorMap: () => ({ message: "Необходимо согласие" }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Пароли не совпадают",
  });
type FormValues = z.infer<typeof schema>;

export default function Signup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUIStore((s) => s.pushToast);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { referralCode: "" },
  });

  useEffect(() => {
    const ref = params.get("ref");
    if (ref) setValue("referralCode", ref.toUpperCase());
  }, [params, setValue]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const session = await signupApi({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        firstName: values.firstName.trim(),
        referralCode: values.referralCode?.trim() || undefined,
      });
      setSession(session);
      pushToast({
        type: "success",
        message: "Аккаунт создан. Проверьте email для подтверждения.",
        durationMs: 6000,
      });
      navigate("/app", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setServerError(err.message);
      else setServerError("Не удалось создать аккаунт. Попробуйте позже.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="card w-full max-w-[400px] p-8 anim-page-in">
        <div className="brand-text text-3xl mb-2">AI Box</div>
        <p className="text-text-secondary text-sm mb-7">Регистрация</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            id="firstName"
            label="Имя"
            autoComplete="given-name"
            autoFocus
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            id="password"
            label="Пароль"
            togglePassword
            autoComplete="new-password"
            error={errors.password?.message}
            hint="Не короче 8 символов"
            {...register("password")}
          />
          <Input
            id="confirmPassword"
            label="Повторите пароль"
            togglePassword
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
          <Input
            id="referralCode"
            label="Реферальный код (опционально)"
            style={{ textTransform: "uppercase" }}
            error={errors.referralCode?.message}
            {...register("referralCode")}
          />

          <label className="inline-flex items-start gap-2 text-sm text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 mt-0.5 accent-accent shrink-0"
              {...register("agree")}
            />
            <span>
              Я согласен(а) с{" "}
              <a
                href={`${import.meta.env.VITE_METABOX_SITE_URL}/legal/offer`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                офертой
              </a>{" "}
              и{" "}
              <a
                href={`${import.meta.env.VITE_METABOX_SITE_URL}/legal/privacy`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                обработкой ПД
              </a>
            </span>
          </label>
          {errors.agree && <div className="text-xs text-danger -mt-3">{errors.agree.message}</div>}

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

          <Button type="submit" loading={isSubmitting} fullWidth>
            Создать аккаунт
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-border text-center text-sm text-text-secondary">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
