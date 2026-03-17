import { useState, useEffect } from "react";
import { useTelegramInit } from "./hooks/useTelegramInit.js";
import { BottomNav } from "./components/BottomNav.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { ManagementPage } from "./pages/ManagementPage.js";
import { TariffsPage } from "./pages/TariffsPage.js";
import { ReferralPage } from "./pages/ReferralPage.js";
import { AdminPage } from "./pages/AdminPage.js";
import { I18nProvider, useI18n } from "./i18n.js";
import { api } from "./api/client.js";
import type { Page, UserProfile } from "./types.js";

function parseHash(): { page: Page; section?: string } {
  const [pagePart, sectionPart] = window.location.hash.slice(1).split("/");
  const validPages: Page[] = ["profile", "management", "tariffs", "referral", "admin"];
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
  const { ready, error } = useTelegramInit();
  const { t } = useI18n();

  useEffect(() => {
    if (ready) {
      api.profile.get().then(setProfile).catch(console.error);
    }
  }, [ready]);

  const isAdmin = profile?.role === "ADMIN" || profile?.role === "MODERATOR";

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
                <stop offset="0%" stopColor="#9B8ED8" />
                <stop offset="100%" stopColor="#7B6FB8" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#sg)" />
            <path d="M16 24l6 6 10-12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <div className="splash__text">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__logo">✦ {t("app.name")}</span>
        <div className="app-header__right">
          <LangPicker />
        </div>
      </header>

      <main className="app-main">
        {page === "profile" && <ProfilePage />}
        {page === "management" && <ManagementPage initialSection={initial.section} />}
        {page === "tariffs" && <TariffsPage />}
        {page === "referral" && <ReferralPage />}
        {page === "admin" && <AdminPage />}
      </main>

      <BottomNav current={page} onChange={setPage} showAdmin={isAdmin} />
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
