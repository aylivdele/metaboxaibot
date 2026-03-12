import { useState } from "react";
import { useTelegramInit } from "./hooks/useTelegramInit.js";
import { BottomNav } from "./components/BottomNav.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { ManagementPage } from "./pages/ManagementPage.js";
import { TariffsPage } from "./pages/TariffsPage.js";
import { ReferralPage } from "./pages/ReferralPage.js";
import type { Page } from "./types.js";

export function App() {
  const [page, setPage] = useState<Page>("profile");
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
        {page === "management" && <ManagementPage />}
        {page === "tariffs" && <TariffsPage />}
        {page === "referral" && <ReferralPage />}
      </main>

      <BottomNav current={page} onChange={setPage} />
    </div>
  );
}
