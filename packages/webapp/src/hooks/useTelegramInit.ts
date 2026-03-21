import { useEffect, useState } from "react";
import { setInitDataRaw, api } from "../api/client.js";

type TelegramWebApp = { initData: string; ready?: () => void };

export interface TelegramInitState {
  ready: boolean;
  error: string | null;
  /** Non-fatal warning shown while still polling (loader stays visible). */
  warning: string | null;
  userId: string | null;
  initDataRaw: string | null;
}

const WARN_AFTER_MS = 3000;
const POLL_INTERVAL_MS = 50;

function getTgWebApp(): TelegramWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function useTelegramInit(): TelegramInitState {
  const [state, setState] = useState<TelegramInitState>({
    ready: false,
    error: null,
    warning: null,
    userId: null,
    initDataRaw: null,
  });

  useEffect(() => {
    getTgWebApp()?.ready?.();

    if (import.meta.env.DEV) {
      setState({ ready: true, error: null, warning: null, userId: "dev", initDataRaw: null });
      return;
    }

    let elapsed = 0;
    let cancelled = false;
    let warned = false;
    let authInProgress = false;

    const poll = () => {
      if (cancelled) return;

      const tg = getTgWebApp();
      // For reply-keyboard webApp buttons Telegram may inject #tgWebAppData=...
      // into the URL hash asynchronously (after the SDK already ran synchronously),
      // so initData stays "" on the SDK object. Read the hash directly as fallback.
      const hashRaw = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData") ?? "";
      const raw = tg?.initData || hashRaw;
      console.log(`Hash: ${window.location.hash}`);
      console.log(`tg: ${JSON.stringify(tg)}`);

      if (raw && !authInProgress) {
        authInProgress = true;
        setInitDataRaw(raw);
        api.auth
          .verify(raw)
          .then((user) => {
            if (!cancelled) {
              setState({
                ready: true,
                error: null,
                warning: null,
                userId: user.id,
                initDataRaw: raw,
              });
            }
          })
          .catch((err: Error) => {
            if (!cancelled) {
              setState({
                ready: false,
                error: err.message,
                warning: null,
                userId: null,
                initDataRaw: raw,
              });
            }
          });
        return;
      }

      // Show warning after WARN_AFTER_MS but keep polling indefinitely
      if (!warned && elapsed >= WARN_AFTER_MS) {
        warned = true;
        setState((prev) => ({
          ...prev,
          warning: "Please open this app from Telegram",
        }));
      }

      elapsed += POLL_INTERVAL_MS;
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
