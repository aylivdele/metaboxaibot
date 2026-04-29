import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { TranslationKey } from "../i18n.js";

interface Props {
  firstName?: string | null;
  username?: string | null;
  onBack: () => void;
  onSuccess?: () => void;
}

type Mode = "choose" | "register" | "login";

interface PendingState {
  email: string;
  // "view" — показываем «проверьте почту» с кнопками,
  // "change" — форма ввода нового email.
  view: "view" | "change";
}

type TgWebApp = {
  openLink?: (url: string) => void;
  initDataUnsafe?: { user?: { last_name?: string } };
};

function openSso(ssoUrl: string) {
  const tg = (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(ssoUrl);
  } else {
    window.open(ssoUrl, "_blank");
  }
}

function getTgLastName(): string | undefined {
  const tg = (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return tg?.initDataUnsafe?.user?.last_name || undefined;
}

const ERROR_MAP: Record<string, TranslationKey> = {
  EMAIL_EXISTS: "linkMetabox.error.emailExists",
  TELEGRAM_LINKED: "linkMetabox.error.telegramLinked",
  USER_NOT_FOUND: "linkMetabox.error.userNotFound",
  INVALID_PASSWORD: "linkMetabox.error.invalidPassword",
  EMAIL_NOT_VERIFIED: "linkMetabox.error.emailNotVerified",
  PASSWORD_TOO_SHORT: "linkMetabox.error.passwordTooShort",
};

// Inline SVG envelope. На macOS Telegram unicode-символ ✉ не рендерится
// в веб-вьюхе [нет нужного шрифта/глифа], поэтому используем SVG —
// он одинаково работает на всех платформах.
function MailIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

export function LinkMetaboxPage({ firstName, username, onBack, onSuccess }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeBlockedModal, setMergeBlockedModal] = useState<{
    siteMentor: { name: string; contact: string };
    botMentor: { name: string; contact: string };
  } | null>(null);
  // pending = аккаунт уже привязан, но email НЕ подтверждён. Показываем
  // экран «Проверьте почту» с кнопками «Отправить повторно» / «Изменить».
  const [pending, setPending] = useState<PendingState | null>(null);
  const [pendingNewEmail, setPendingNewEmail] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingMessageType, setPendingMessageType] = useState<"info" | "success" | "error">(
    "info",
  );
  const [statusLoading, setStatusLoading] = useState(true);
  // Cooldown между resend-попытками. Отсчёт идёт на UI, а сервер
  // независимо рейт-лимитит [60 сек между, максимум 3 в час].
  const [cooldown, setCooldown] = useState(0);
  const [resentOnce, setResentOnce] = useState(false);
  // attemptsLeft: null — ещё не запрашивали, число — пришло с сервера.
  // Когда сервер сказал 0 — лимит исчерпан, кнопку скрываем целиком.
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // На монтировании проверяем — может юзер уже зарегистрировался ранее
  // и должен видеть pending-экран сразу [не choose].
  useEffect(() => {
    let cancelled = false;
    api.profile
      .metaboxStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.linked && !status.emailVerified) {
          setPending({ email: status.email, view: "view" });
        }
      })
      .catch(() => {
        // Если статус не получили — продолжаем с choose как обычно.
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!email.trim() || !password) return;
    if (mode === "register") {
      if (password !== confirmPassword) {
        setError(t("linkMetabox.passwordMismatch"));
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const result =
        mode === "register"
          ? await api.profile.metaboxRegister(
              email.trim(),
              password,
              firstName ?? undefined,
              getTgLastName(),
              username ?? undefined,
            )
          : await api.profile.metaboxLogin(email.trim(), password);

      // При регистрации backend может вернуть requiresVerification — это
      // значит письмо с подтверждением отправлено, SSO-логин НЕ выдан.
      // Показываем pending-экран «Проверьте почту», не открываем SSO.
      // Toast «письмо отправлено» здесь НЕ показываем — он дублирует
      // содержимое самого экрана [«We sent a confirmation link to: …»].
      // Алерт оставляем только для явных действий юзера: resend / change-email.
      if ("requiresVerification" in result && result.requiresVerification) {
        setPending({ email: result.email, view: "view" });
        onSuccess?.();
        return;
      }

      if ("ssoUrl" in result && result.ssoUrl) {
        openSso(result.ssoUrl);
        onSuccess?.();
        onBack();
      }
    } catch (err: any) {
      const code = err?.code;
      const supportTg = import.meta.env.VITE_SUPPORT_TG ?? "metaboxsupport";
      if (code === "MERGE_BLOCKED") {
        const sm = err?.siteMentor || {};
        const bm = err?.botMentor || {};
        const unknown = t("linkMetabox.merge.unknown");
        setMergeBlockedModal({
          siteMentor: { name: sm.name || unknown, contact: sm.contact || "" },
          botMentor: { name: bm.name || unknown, contact: bm.contact || "" },
        });
      } else if (code === "MENTOR_CONFLICT") {
        const sm = err?.siteMentor || {};
        const bm = err?.botMentor || {};
        const unknown = t("linkMetabox.merge.unknown");
        const siteInfo = sm.contact ? `${sm.name} (${sm.contact})` : sm.name || unknown;
        const botInfo = bm.contact ? `${bm.name} (${bm.contact})` : bm.name || unknown;
        setError(
          t("linkMetabox.error.mentorConflict")
            .replace("{site}", siteInfo)
            .replace("{bot}", botInfo),
        );
      } else if (code === "TELEGRAM_MISMATCH" && err?.linkedTo) {
        const lt = err.linkedTo;
        const tgInfo = lt.telegramUsername ? `@${lt.telegramUsername}` : lt.telegramPhone || "";
        setError(
          t("linkMetabox.error.telegramMismatch")
            .replace("{info}", tgInfo ? ` (${tgInfo})` : "")
            .replace("{support}", supportTg),
        );
      } else if (code === "TELEGRAM_LINKED" && err?.linkedTo) {
        const lt = err.linkedTo;
        const tgInfo = lt.telegramUsername ? `@${lt.telegramUsername}` : lt.telegramPhone || "";
        setError(
          t("linkMetabox.error.telegramLinkedOther")
            .replace("{name}", lt.name || email)
            .replace("{info}", tgInfo ? ` (${tgInfo})` : "")
            .replace("{support}", supportTg),
        );
      } else {
        const key = code ? ERROR_MAP[code] : undefined;
        setError(key ? t(key) : t("linkMetabox.error"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pending) return;
    if (cooldown > 0) return;
    setLoading(true);
    setPendingMessage(null);
    setPendingMessageType("info");
    try {
      const result = await api.profile.metaboxResendVerification();
      if (result.alreadyVerified) {
        // Email уже подтверждён [юзер кликнул по ссылке после того как
        // открыл pending] — закрываем pending-стадию.
        setPending(null);
        setPendingMessage(t("linkMetabox.verify.alreadyVerified"));
        setPendingMessageType("success");
      } else {
        // Просим юзера сразу проверить, что email указан верно — это
        // частая причина "не пришло письмо": опечатка в адресе.
        setPendingMessage(t("linkMetabox.verify.sentSuccess"));
        setPendingMessageType("success");
        setResentOnce(true);
        // cooldownSec приходит с сервера, fallback 60.
        setCooldown(result.cooldownSec ?? 60);
      }
      if (typeof result.attemptsLeft === "number") {
        setAttemptsLeft(result.attemptsLeft);
      }
    } catch (err: any) {
      // 429 RATE_LIMITED или другая ошибка
      const retryAfter = err?.retryAfterSec ?? 0;
      if (err?.code === "RATE_LIMITED") {
        if (retryAfter > 0) setCooldown(retryAfter);
        if (typeof err?.attemptsLeft === "number") setAttemptsLeft(err.attemptsLeft);
      }
      setPendingMessage(err?.error || t("linkMetabox.verify.sendError"));
      setPendingMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmailSubmit = async () => {
    if (!pending) return;
    const newEmail = pendingNewEmail.trim();
    if (!newEmail) return;
    setLoading(true);
    setPendingMessage(null);
    setError(null);
    try {
      const result = await api.profile.metaboxChangeEmail(newEmail);
      setPending({ email: result.email, view: "view" });
      setPendingNewEmail("");
      setPendingMessage(result.warning ?? t("linkMetabox.verify.sent"));
      setPendingMessageType(result.warning ? "error" : "success");
      setResentOnce(true);
      // После change-email сервер сбросил счётчик попыток. Возвращаем
      // attemptsLeft в "неизвестное" состояние [null], чтобы кнопка
      // resend снова показалась — лимит на этого юзера в новом окне.
      setAttemptsLeft(null);
      // Cooldown на одно письмо всё равно показываем — чтобы юзер не
      // кликал часто и не плодил writes на SMTP.
      setCooldown(60);
    } catch (err: any) {
      const code = err?.code;
      if (code === "EMAIL_EXISTS") {
        setError(t("linkMetabox.changeEmail.error.exists"));
      } else if (code === "SAME_EMAIL") {
        setError(t("linkMetabox.changeEmail.error.same"));
      } else if (code === "INVALID_EMAIL") {
        setError(t("linkMetabox.changeEmail.error.invalid"));
      } else if (code === "ALREADY_VERIFIED") {
        setError(t("linkMetabox.changeEmail.error.alreadyVerified"));
      } else {
        setError(err?.error || t("linkMetabox.changeEmail.error.generic"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <button className="chat-back-btn" onClick={onBack}>
          ←
        </button>
        <h2>{t("linkMetabox.title")}</h2>
      </div>

      {pending && pending.view === "view" && (
        <div className="verify-card">
          <div className="verify-card__icon" aria-hidden>
            <MailIcon size={28} />
          </div>

          <h3 className="verify-card__title">{t("linkMetabox.verify.title")}</h3>

          <p className="verify-card__subtitle">{t("linkMetabox.verify.subtitle")}</p>

          <div className="verify-card__email-badge">
            <span className="verify-card__email-icon" aria-hidden>
              <MailIcon size={14} />
            </span>
            <span className="verify-card__email-text">{pending.email}</span>
          </div>

          <p className="verify-card__subtitle">{t("linkMetabox.verify.followLink")}</p>

          <div className="verify-card__hint">{t("linkMetabox.verify.checkSpam")}</div>

          {pendingMessage && (
            <div className={`verify-card__alert verify-card__alert--${pendingMessageType}`}>
              {pendingMessage}
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {attemptsLeft === 0 ? (
            // Лимит resend исчерпан — кнопку убираем целиком, оставляем
            // только подсказку и опцию изменить email [через "Изменить почту"
            // ниже сервер сбросит счётчик].
            <div className="verify-card__alert verify-card__alert--info">
              {t("linkMetabox.verify.limitExhausted")}
            </div>
          ) : (
            <button
              className="primary-btn"
              onClick={() => void handleResend()}
              disabled={loading || cooldown > 0}
            >
              {loading
                ? t("common.loading")
                : cooldown > 0
                  ? t("linkMetabox.verify.resendCooldown").replace("{n}", String(cooldown))
                  : resentOnce
                    ? t("linkMetabox.verify.resendAgain")
                    : t("linkMetabox.verify.resend")}
            </button>
          )}

          <button
            className="secondary-btn"
            onClick={() => {
              setPending({ ...pending, view: "change" });
              setPendingNewEmail("");
              setPendingMessage(null);
              setError(null);
            }}
            disabled={loading}
          >
            {t("linkMetabox.verify.changeEmail")}
          </button>
        </div>
      )}

      {pending && pending.view === "change" && (
        <div className="verify-card">
          <div className="verify-card__icon" aria-hidden>
            <MailIcon size={28} />
          </div>

          <h3 className="verify-card__title">{t("linkMetabox.changeEmail.title")}</h3>

          <p className="verify-card__subtitle">{t("linkMetabox.changeEmail.subtitle")}</p>

          <div className="form-field">
            <label className="form-label">{t("linkMetabox.changeEmail.label")}</label>
            <input
              className="form-input"
              type="email"
              value={pendingNewEmail}
              onChange={(e) => setPendingNewEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            className="primary-btn"
            onClick={() => void handleChangeEmailSubmit()}
            disabled={loading || !pendingNewEmail.trim()}
          >
            {loading ? t("common.loading") : t("linkMetabox.changeEmail.save")}
          </button>
          <button
            className="secondary-btn"
            onClick={() => {
              setPending({ ...pending, view: "view" });
              setError(null);
            }}
            disabled={loading}
          >
            {t("common.back")}
          </button>
        </div>
      )}

      {!pending && !statusLoading && mode === "choose" && (
        <div className="link-metabox-choose">
          <p className="page-subtitle">{t("linkMetabox.subtitle")}</p>
          <button className="primary-btn" onClick={() => setMode("register")}>
            {t("linkMetabox.newAccount")}
          </button>
          <button className="secondary-btn" onClick={() => setMode("login")}>
            {t("linkMetabox.existingAccount")}
          </button>
        </div>
      )}

      {!pending && !statusLoading && (mode === "register" || mode === "login") && (
        <div className="link-metabox-form">
          <p className="page-subtitle">
            {mode === "register" ? t("linkMetabox.registerHint") : t("linkMetabox.loginHint")}
          </p>

          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label className="form-label">{t("linkMetabox.password")}</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </div>

          {mode === "register" && (
            <div className="form-field">
              <label className="form-label">{t("linkMetabox.confirmPassword")}</label>
              <input
                className="form-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <button className="primary-btn" onClick={() => void submit()} disabled={loading}>
            {loading ? t("common.loading") : t("linkMetabox.submit")}
          </button>
          <button className="secondary-btn" onClick={() => setMode("choose")} disabled={loading}>
            {t("common.back")}
          </button>
        </div>
      )}
      {/* MERGE_BLOCKED modal */}
      {mergeBlockedModal && (
        <div className="modal-overlay" onClick={() => setMergeBlockedModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setMergeBlockedModal(null)}>
              ✕
            </button>
            <h3 className="modal-title">{t("linkMetabox.merge.blocked")}</h3>
            <p className="modal-text">{t("linkMetabox.merge.blockedText")}</p>
            <div className="modal-mentor">
              <span className="modal-mentor-label">{t("linkMetabox.merge.mentorSite")}</span>
              <span className="modal-mentor-name">
                <b>{mergeBlockedModal.siteMentor.name}</b>
                {mergeBlockedModal.siteMentor.contact &&
                  (mergeBlockedModal.siteMentor.contact.startsWith("@") ? (
                    <>
                      {" "}
                      (
                      <a
                        href={`https://t.me/${mergeBlockedModal.siteMentor.contact.slice(1)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal-link"
                      >
                        {mergeBlockedModal.siteMentor.contact}
                      </a>
                      )
                    </>
                  ) : (
                    <> ({mergeBlockedModal.siteMentor.contact})</>
                  ))}
              </span>
            </div>
            <div className="modal-mentor">
              <span className="modal-mentor-label">{t("linkMetabox.merge.mentorBot")}</span>
              <span className="modal-mentor-name">
                <b>{mergeBlockedModal.botMentor.name}</b>
                {mergeBlockedModal.botMentor.contact &&
                  (mergeBlockedModal.botMentor.contact.startsWith("@") ? (
                    <>
                      {" "}
                      (
                      <a
                        href={`https://t.me/${mergeBlockedModal.botMentor.contact.slice(1)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal-link"
                      >
                        {mergeBlockedModal.botMentor.contact}
                      </a>
                      )
                    </>
                  ) : (
                    <> ({mergeBlockedModal.botMentor.contact})</>
                  ))}
              </span>
            </div>
            <p className="modal-support">
              {t("linkMetabox.merge.support")}{" "}
              <a
                href={`https://t.me/${import.meta.env.VITE_SUPPORT_TG ?? "metaboxsupport"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="modal-link"
              >
                @{import.meta.env.VITE_SUPPORT_TG ?? "metaboxsupport"}
              </a>
            </p>
            <button className="primary-btn" onClick={() => setMergeBlockedModal(null)}>
              {t("linkMetabox.merge.ok")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
