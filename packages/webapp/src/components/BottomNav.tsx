import type { Page } from "../types.js";

interface Props {
  current: Page;
  onChange: (page: Page) => void;
}

const TABS: Array<{ id: Page; label: string; icon: string }> = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "management", label: "Manage", icon: "⚙️" },
  { id: "tariffs", label: "Tariffs", icon: "💳" },
  { id: "referral", label: "Referral", icon: "🎁" },
];

export function BottomNav({ current, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`bottom-nav__tab${current === tab.id ? " bottom-nav__tab--active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="bottom-nav__icon">{tab.icon}</span>
          <span className="bottom-nav__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
