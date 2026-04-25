import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { forgotPassword } from "@/api/auth";
import { ApiError } from "@/api/client";

const schema = z.object({
  email: z.string().min(1, "Укажите email").email("Некорректный email"),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await forgotPassword(values.email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) setServerError(err.message);
      else setServerError("Не удалось отправить письмо. Попробуйте позже.");
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <div className="card w-full max-w-[400px] p-8 text-center anim-page-in">
          <div className="brand-text text-3xl mb-2">AI Box</div>
          <h1 className="text-xl font-bold mt-4 mb-2">Проверьте почту</h1>
          <p className="text-text-secondary text-sm mb-6">
            Если аккаунт с адресом{" "}
            <span className="text-text font-semibold">{getValues("email")}</span> существует, мы
            отправили ссылку для сброса пароля. Ссылка действительна 1 час.
          </p>
          <Link to="/login" className="text-accent hover:underline text-sm">
            ← Вернуться ко входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="card w-full max-w-[400px] p-8 anim-page-in">
        <div className="brand-text text-3xl mb-2">AI Box</div>
        <p className="text-text-secondary text-sm mb-7">Восстановление пароля</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            hint="Мы отправим ссылку для сброса пароля на этот адрес."
            error={errors.email?.message}
            {...register("email")}
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
            Отправить ссылку
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
