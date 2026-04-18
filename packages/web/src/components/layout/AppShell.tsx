import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { ToastContainer } from "@/components/common/ToastContainer";
import { TelegramLinkModal } from "@/components/TelegramLinkModal";
import { useUIStore } from "@/stores/uiStore";

/**
 * Общий контейнер защищённой зоны. Desktop: sidebar слева + main справа.
 * Mobile: bottom nav + main на всю ширину.
 */
export function AppShell() {
  const telegramLinkModal = useUIStore((s) => s.telegramLinkModal);
  const closeTelegramLinkModal = useUIStore((s) => s.closeTelegramLinkModal);

  return (
    <div className="h-screen flex bg-bg text-text">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-border bg-bg-card">
        <Sidebar />
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden pad-safe-bottom lg:pb-0">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Глобальные тосты */}
      <ToastContainer />

      {/* Модалка «Привяжите Telegram» */}
      <TelegramLinkModal
        open={telegramLinkModal.open}
        onClose={closeTelegramLinkModal}
        context={telegramLinkModal.context}
      />
    </div>
  );
}
