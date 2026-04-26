import { useState } from "react";
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
      openSso(result.ssoUrl);
      onSuccess?.();
      onBack();
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

  return (
    <div className="page">
      <div className="page-header">
        <button className="chat-back-btn" onClick={onBack}>
          ←
        </button>
        <h2>{t("linkMetabox.title")}</h2>
      </div>

      {mode === "choose" && (
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

      {(mode === "register" || mode === "login") && (
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
