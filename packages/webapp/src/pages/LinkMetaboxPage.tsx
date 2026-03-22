import { useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";

interface Props {
  firstName?: string | null;
  onBack: () => void;
}

type Mode = "choose" | "register" | "login";

function openSso(ssoUrl: string) {
  const tg = (window as Window & { Telegram?: { WebApp?: { openLink?: (url: string) => void } } })
    .Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(ssoUrl);
  } else {
    window.open(ssoUrl, "_blank");
  }
}

export function LinkMetaboxPage({ firstName, onBack }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const result =
        mode === "register"
          ? await api.profile.metaboxRegister(email.trim(), password, firstName ?? undefined)
          : await api.profile.metaboxLogin(email.trim(), password);
      openSso(result.ssoUrl);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("linkMetabox.error"));
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

          {error && <div className="form-error">{error}</div>}

          <button className="primary-btn" onClick={() => void submit()} disabled={loading}>
            {loading ? t("common.loading") : t("linkMetabox.submit")}
          </button>
          <button className="secondary-btn" onClick={() => setMode("choose")} disabled={loading}>
            {t("common.back")}
          </button>
        </div>
      )}
    </div>
  );
}
