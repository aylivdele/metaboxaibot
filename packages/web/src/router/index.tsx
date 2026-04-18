import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute, GuestOnlyRoute } from "./guards";

// Lazy-loaded pages — каждый роут отдельным чанком
const LoginPage = lazy(() => import("@/pages/Login"));
const SignupPage = lazy(() => import("@/pages/Signup"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPassword"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPassword"));

const ChatPage = lazy(() => import("@/pages/Chat"));
const HistoryPage = lazy(() => import("@/pages/History"));
const PlansPage = lazy(() => import("@/pages/Plans"));
const TokensPage = lazy(() => import("@/pages/Tokens"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const BillingPage = lazy(() => import("@/pages/Billing"));

const PaymentSuccessPage = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentPendingPage = lazy(() => import("@/pages/PaymentPending"));
const PaymentFailedPage = lazy(() => import("@/pages/PaymentFailed"));

const NotFoundPage = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-text-secondary">Загрузка…</div>
    </div>
  );
}

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  // Root → редирект в зависимости от авторизации (обрабатывается guard'ом)
  {
    path: "/",
    element: <Navigate to="/app" replace />,
  },

  // Гостевые роуты
  {
    path: "/login",
    element: <GuestOnlyRoute>{withSuspense(<LoginPage />)}</GuestOnlyRoute>,
  },
  {
    path: "/signup",
    element: <GuestOnlyRoute>{withSuspense(<SignupPage />)}</GuestOnlyRoute>,
  },
  {
    path: "/forgot-password",
    element: <GuestOnlyRoute>{withSuspense(<ForgotPasswordPage />)}</GuestOnlyRoute>,
  },
  {
    path: "/reset-password",
    element: withSuspense(<ResetPasswordPage />),
  },

  // Защищённая зона
  {
    path: "/app",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="chat" replace /> },
      { path: "chat", element: withSuspense(<ChatPage />) },
      { path: "chat/:id", element: withSuspense(<ChatPage />) },
      { path: "history", element: withSuspense(<HistoryPage />) },
      { path: "plans", element: withSuspense(<PlansPage />) },
      { path: "tokens", element: withSuspense(<TokensPage />) },
      { path: "profile", element: withSuspense(<ProfilePage />) },
      { path: "billing", element: withSuspense(<BillingPage />) },
    ],
  },

  // Оплата
  {
    path: "/payment/success",
    element: <ProtectedRoute>{withSuspense(<PaymentSuccessPage />)}</ProtectedRoute>,
  },
  {
    path: "/payment/pending",
    element: <ProtectedRoute>{withSuspense(<PaymentPendingPage />)}</ProtectedRoute>,
  },
  {
    path: "/payment/failed",
    element: <ProtectedRoute>{withSuspense(<PaymentFailedPage />)}</ProtectedRoute>,
  },

  { path: "*", element: withSuspense(<NotFoundPage />) },
]);
