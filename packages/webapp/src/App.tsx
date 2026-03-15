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
        <div className="splash__icon">⚡</div>
        <div className="splash__text">Loading Metabox…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__logo">⚡ Metabox</span>
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
