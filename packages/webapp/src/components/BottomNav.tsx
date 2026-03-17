import type { ReactElement } from "react";
import { useI18n } from "../i18n.js";
import type { Page } from "../types.js";

interface Props {
  current: Page;
  onChange: (page: Page) => void;
  showAdmin: boolean;
}

const TABS: Array<{
  id: Page;
  labelKey: string;
  icon: (active: boolean) => ReactElement;
  adminOnly?: boolean;
}> = [
  {
    id: "profile",
    labelKey: "nav.profile",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "management",
    labelKey: "nav.manage",
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
    labelKey: "nav.tariffs",
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
    labelKey: "nav.referral",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    id: "gallery",
    labelKey: "nav.gallery",
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    id: "admin",
    labelKey: "nav.admin",
    adminOnly: true,
    icon: (active) => (
      <svg viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8}>
        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

export function BottomNav({ current, onChange, showAdmin }: Props) {
  const { t } = useI18n();
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || showAdmin);

  return (
    <nav className="bottom-nav">
      {visibleTabs.map((tab) => {
        const isActive = current === tab.id;
        return (
          <button
            key={tab.id}
            className={`bottom-nav__tab${isActive ? " bottom-nav__tab--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="bottom-nav__icon">{tab.icon(isActive)}</span>
            <span className="bottom-nav__label">{t(tab.labelKey as any)}</span>
          </button>
        );
      })}
    </nav>
  );
}
