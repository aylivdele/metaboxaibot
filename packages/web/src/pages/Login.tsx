import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { login as loginApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

const schema = z.object({
  email: z.string().min(1, "Укажите email").email("Некорректный email"),
  password: z.string().min(6, "Минимум 6 символов"),
  rememberMe: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUIStore((s) => s.pushToast);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rememberMe: true },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const session = await loginApi({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        rememberMe: values.rememberMe ?? true,
      });
      setSession(session);
      pushToast({ type: "success", message: "С возвращением!" });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/") ? from : "/app", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Не удалось войти. Попробуйте позже.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="card w-full max-w-[400px] p-8 anim-page-in">
        <div className="brand-text text-3xl mb-2">AI Box</div>
        <p className="text-text-secondary text-sm mb-7">Вход в аккаунт</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            id="password"
            label="Пароль"
            togglePassword
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          <label className="inline-flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent"
              {...register("rememberMe")}
            />
            Запомнить меня
          </label>

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
            Войти
          </Button>

          <div className="text-center text-sm">
            <Link to="/forgot-password" className="text-accent hover:underline">
              Забыли пароль?
            </Link>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-border text-center text-sm text-text-secondary">
          Нет аккаунта?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}
