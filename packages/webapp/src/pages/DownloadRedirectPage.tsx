import { useEffect, useState } from "react";
import { API_BASE } from "../api/client.js";
import { useI18n } from "../i18n.js";
import { closeMiniApp, openExternalLink } from "../utils/telegram.js";

/**
 * Bridge page rendered when a Telegram inline button uses
 * `web_app: { url: ${webappUrl}?page=download&token=... }`. Telegram opens
 * this inside the WebView, where we cannot trigger a real file download —
 * so we immediately bounce the user to the system browser via
 * `Telegram.WebApp.openLink(...)` and then close the mini-app.
 *
 * Renders before the normal auth flow because we don't need any API access:
 * the token is already an HMAC-signed grant for a specific S3 object.
 */
export function DownloadRedirectPage({ token }: { token: string }) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);

  const downloadUrl = `${API_BASE}/download/${token}`;

  useEffect(() => {
    if (!token) return;
    openExternalLink(downloadUrl);
    setOpened(true);
    // Give the browser a moment to actually take focus before we collapse
    // the mini-app — otherwise on iOS the openLink request can race the
    // close() and the system browser never opens.
    const timer = setTimeout(() => closeMiniApp(), 1500);
    return () => clearTimeout(timer);
  }, [token, downloadUrl]);

  if (!token) {
    return (
      <div className="splash">
        <div className="splash__icon">⚠️</div>
        <div className="splash__text">{t("download.invalidToken")}</div>
      </div>
    );
  }

  return (
    <div className="splash">
      <div className="splash__icon">⬇️</div>
      <div className="splash__text">
        {opened ? t("download.openedInBrowser") : t("download.opening")}
      </div>
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="splash__warning"
        style={{ marginTop: 12, textDecoration: "underline" }}
      >
        {t("download.fallbackLink")}
      </a>
    </div>
  );
}
