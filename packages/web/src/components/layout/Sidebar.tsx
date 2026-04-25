import { NavLink } from "react-router-dom";
import { MessageSquare, History, Sparkles, Coins, User, LogOut } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/stores/authStore";

const navItems = [
  { to: "/app/chat", label: "Чат", icon: MessageSquare },
  { to: "/app/history", label: "История", icon: History },
  { to: "/app/plans", label: "Тарифы", icon: Sparkles },
  { to: "/app/tokens", label: "Токены", icon: Coins },
  { to: "/app/profile", label: "Профиль", icon: User },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <div className="flex flex-col h-full p-3">
      {/* Логотип */}
      <div className="px-3 py-4 mb-2">
        <div className="brand-text text-xl">AI Box</div>
      </div>

      {/* Баланс */}
      <div
        className="mx-1 mb-3 p-4 rounded-lg"
        style={{
          background: "var(--accent-gradient)",
          boxShadow: "var(--shadow-accent)",
        }}
      >
        <div className="text-[11px] uppercase tracking-wide text-white/80 font-semibold">
          Баланс
        </div>
        <div className="text-xl font-bold text-white mt-1">
          {user?.tokenBalance ?? "0"}{" "}
          <span className="text-sm font-medium opacity-80">токенов</span>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 h-10 rounded text-sm font-medium transition-colors",
                isActive
                  ? "bg-bg-elevated text-text"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text",
              )
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border pt-3 mt-2">
        <div className="px-3 py-2 text-xs text-text-hint truncate">{user?.email}</div>
        <button
          className="w-full flex items-center gap-3 px-3 h-10 rounded text-sm text-text-secondary hover:bg-bg-secondary hover:text-danger transition-colors"
          onClick={() => logout()}
        >
          <LogOut size={18} />
          <span>Выйти</span>
        </button>
      </div>
    </div>
  );
}
