import type { ReactElement } from "react";
import type { Page } from "../types.js";

interface Props {
  current: Page;
  onChange: (page: Page) => void;
}

const TABS: Array<{ id: Page; label: string; icon: (active: boolean) => ReactElement }> = [
  {
    id: "profile",
    label: "Profile",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "management",
    label: "Manage",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "tariffs",
    label: "Tariffs",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: "referral",
    label: "Referral",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
];

export function BottomNav({ current, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const isActive = current === tab.id;
        return (
          <button
            key={tab.id}
            className={`bottom-nav__tab${isActive ? " bottom-nav__tab--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="bottom-nav__icon">{tab.icon(isActive)}</span>
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
