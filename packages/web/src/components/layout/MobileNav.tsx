import { NavLink } from "react-router-dom";
import { MessageSquare, Sparkles, User } from "lucide-react";
import clsx from "clsx";

const tabs = [
  { to: "/app/chat", label: "Чат", icon: MessageSquare },
  { to: "/app/plans", label: "Тарифы", icon: Sparkles },
  { to: "/app/profile", label: "Профиль", icon: User },
];

export function MobileNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-card border-t border-border z-40 safe-bottom"
      style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" }}
    >
      <div className="flex h-[72px] items-center px-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded transition-colors",
                isActive ? "text-accent" : "text-text-hint",
              )
            }
          >
            {({ isActive }) => (
              <>
                <t.icon size={22} />
                <span className="text-[11px] font-medium">{t.label}</span>
                {isActive && <span className="absolute top-1 w-5 h-[2px] bg-accent rounded" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
