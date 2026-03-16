import { useState } from "react";
import { useTelegramInit } from "./hooks/useTelegramInit.js";
import { BottomNav } from "./components/BottomNav.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { ManagementPage } from "./pages/ManagementPage.js";
import { TariffsPage } from "./pages/TariffsPage.js";
import { ReferralPage } from "./pages/ReferralPage.js";
import type { Page } from "./types.js";

/** Parse initial page and section from URL hash, e.g. #management/gpt */
function parseHash(): { page: Page; section?: string } {
  const [pagePart, sectionPart] = window.location.hash.slice(1).split("/");
  const validPages: Page[] = ["profile", "management", "tariffs", "referral"];
  const page = validPages.includes(pagePart as Page) ? (pagePart as Page) : "profile";
  return { page, section: sectionPart };
}

export function App() {
  const initial = parseHash();
  const [page, setPage] = useState<Page>(initial.page);
  const { ready, error } = useTelegramInit();

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
              <linearGradient id="splash-grad" x1="0" y1="0" x2="48" y2="48">
                <stop offset="0%" stopColor="#C4956A" />
                <stop offset="100%" stopColor="#A07A5F" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#splash-grad)" />
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
        <div className="splash__text">Loading Metabox…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__logo">✦ Metabox</span>
      </header>

      <main className="app-main">
        {page === "profile" && <ProfilePage />}
        {page === "management" && <ManagementPage initialSection={initial.section} />}
        {page === "tariffs" && <TariffsPage />}
        {page === "referral" && <ReferralPage />}
      </main>

      <BottomNav current={page} onChange={setPage} />
    </div>
  );
}
