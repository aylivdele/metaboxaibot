import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { resetPassword } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useUIStore } from "@/stores/uiStore";

const schema = z
  .object({
    newPassword: z.string().min(8, "Минимум 8 символов").max(128, "Слишком длинно"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Пароли не совпадают",
  });
type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const token = params.get("token") ?? "";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await resetPassword(token, values.newPassword);
      pushToast({
        type: "success",
        message: "Пароль обновлён. Теперь войдите с новым паролем.",
        durationMs: 6000,
      });
      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setServerError(err.message);
      else setServerError("Не удалось обновить пароль.");
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <div className="card w-full max-w-[400px] p-8 text-center anim-page-in">
          <div className="text-danger font-semibold mb-2">Некорректная ссылка</div>
          <p className="text-text-secondary text-sm mb-6">Токен восстановления отсутствует.</p>
          <Link to="/forgot-password" className="btn-primary inline-flex">
            Запросить новый
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="card w-full max-w-[400px] p-8 anim-page-in">
        <div className="brand-text text-3xl mb-2">AI Box</div>
        <p className="text-text-secondary text-sm mb-7">Новый пароль</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            id="newPassword"
            label="Новый пароль"
            togglePassword
            autoComplete="new-password"
            autoFocus
            hint="Не короче 8 символов"
            error={errors.newPassword?.message}
            {...register("newPassword")}
          />
          <Input
            id="confirmPassword"
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

          <Button type="submit" loading={isSubmitting} fullWidth>
            Обновить пароль
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-border text-center text-sm text-text-secondary">
          <Link to="/login" className="text-accent hover:underline">
            ← Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
