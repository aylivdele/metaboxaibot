import { useState, useEffect } from "react";
import { useTelegramInit } from "./hooks/useTelegramInit.js";
import { BottomNav } from "./components/BottomNav.js";
import { ProfilePage, type ProfileTab } from "./pages/ProfilePage.js";
import { ManagementPage } from "./pages/ManagementPage.js";
import { TariffsPage } from "./pages/TariffsPage.js";
import { ReferralPage } from "./pages/ReferralPage.js";
import { AdminPage } from "./pages/AdminPage.js";
import { LinkMetaboxPage } from "./pages/LinkMetaboxPage.js";
import { I18nProvider, useI18n } from "./i18n.js";
import { api } from "./api/client.js";
import type { Page, UserProfile } from "./types.js";

function parseHash(): { page: Page; section?: string } {
  const validPages: Page[] = ["profile", "management", "tariffs", "referral", "admin"];
  // Prefer query params (?page=...) — avoids conflict with Telegram's #tgWebAppData hash injection
  const params = new URLSearchParams(window.location.search);
  const qPage = params.get("page");
  const qSection = params.get("section") ?? undefined;
  if (qPage && validPages.includes(qPage as Page)) {
    return { page: qPage as Page, section: qSection };
  }
  // Fallback: legacy hash routing (#page or #page/section)
  const [pagePart, sectionPart] = window.location.hash.slice(1).split("/");
  const page = validPages.includes(pagePart as Page) ? (pagePart as Page) : "profile";
  return { page, section: sectionPart };
}

function LangPicker() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="lang-picker">
      <button
        className={`lang-picker__btn${locale === "en" ? " lang-picker__btn--active" : ""}`}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      <button
        className={`lang-picker__btn${locale === "ru" ? " lang-picker__btn--active" : ""}`}
        onClick={() => setLocale("ru")}
      >
        RU
      </button>
    </div>
  );
}

function AppContent() {
  const initial = parseHash();
  const [page, setPage] = useState<Page>(initial.page);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { ready, error, warning } = useTelegramInit();
  const { t } = useI18n();

  useEffect(() => {
    if (ready) {
      api.profile.get().then(setProfile).catch(console.error);
    }
  }, [ready]);

  const isAdmin = profile?.role === "ADMIN" || profile?.role === "MODERATOR";

  const handleLearning = async () => {
    // Refresh profile to check if metaboxUserId is still valid
    try {
      const fresh = await api.profile.get();
      setProfile(fresh);
      if (fresh?.metaboxUserId) {
        const { ssoUrl } = await api.profile.metaboxSso();
        const tg = (
          window as Window & { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }
        ).Telegram?.WebApp;
        if (tg?.openLink) tg.openLink(ssoUrl);
        else window.open(ssoUrl, "_blank");
        return;
      }
    } catch {
      // SSO failed or profile refresh failed
    }
    setPage("linkMetabox");
  };

  if (error) {
    return (
      <div className="splash">
        <div className="splash__icon">⚠️</div>
        <div className="splash__text">{error}</div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash__icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="48" y2="48">
                <stop offset="0%" stopColor="#5A9DF7" />
                <stop offset="100%" stopColor="#3A7DE5" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#sg)" />
            <path
              d="M16 24l6 6 10-12"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <div className="splash__text">{t("common.loading")}</div>
        {warning && <div className="splash__warning">{warning}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__span">
          <img src="/aibox.svg" alt={t("app.name")} className="app-header__logo" />
          AI BOX
        </span>
        <div className="app-header__right">
          <LangPicker />
        </div>
      </header>

      <main className="app-main">
        {page === "profile" && (
          <ProfilePage
            initialSection={
              initial.section && ["overview", "gallery", "settings"].includes(initial.section)
                ? (initial.section as ProfileTab)
                : undefined
            }
          />
        )}
        {page === "management" && <ManagementPage initialSection={initial.section} />}
        {page === "tariffs" && (
          <TariffsPage profile={profile} onLinkMetabox={() => setPage("linkMetabox")} />
        )}
        {page === "referral" && <ReferralPage onLinkMetabox={() => setPage("linkMetabox")} />}
        {page === "admin" && <AdminPage />}
        {page === "linkMetabox" && (
          <LinkMetaboxPage
            firstName={profile?.firstName}
            username={profile?.username}
            onBack={() => setPage("profile")}
            onSuccess={() => api.profile.get().then(setProfile).catch(console.error)}
          />
        )}
      </main>

      {page !== "linkMetabox" && (
        <BottomNav
          current={page}
          onChange={setPage}
          showAdmin={isAdmin}
          onLearning={() => void handleLearning()}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
