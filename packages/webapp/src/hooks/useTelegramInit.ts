import { useEffect, useState } from "react";
import { setInitDataRaw, api } from "../api/client.js";

type TelegramWebApp = { initData: string; ready?: () => void };

export interface TelegramInitState {
  ready: boolean;
  error: string | null;
  userId: string | null;
  initDataRaw: string | null;
}

/**
 * Polls window.Telegram.WebApp.initData until it becomes non-empty,
 * then verifies auth with the backend.
 *
 * Some Telegram clients (especially via reply-keyboard webApp buttons) populate
 * initData asynchronously, so a simple synchronous check in useEffect is not
 * enough — we retry for up to MAX_WAIT_MS before giving up.
 */
const MAX_WAIT_MS = 3000;
const POLL_INTERVAL_MS = 50;

function getTgWebApp(): TelegramWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function useTelegramInit(): TelegramInitState {
  const [state, setState] = useState<TelegramInitState>({
    ready: false,
    error: null,
    userId: null,
    initDataRaw: null,
  });

  useEffect(() => {
    // Signal "app is ready" to Telegram as early as possible so the loading
    // overlay is removed. Safe to call even before initData is available.
    getTgWebApp()?.ready?.();

    if (import.meta.env.DEV) {
      setState({ ready: true, error: null, userId: "dev", initDataRaw: null });
      return;
    }

    let elapsed = 0;
    let cancelled = false;

    const poll = () => {
      if (cancelled) return;

      const tg = getTgWebApp();
      const raw = tg?.initData ?? "";

      if (raw) {
        // initData is available — authenticate with the backend
        setInitDataRaw(raw);
        api.auth
          .verify(raw)
          .then((user) => {
            if (!cancelled) {
              setState({ ready: true, error: null, userId: user.id, initDataRaw: raw });
            }
          })
          .catch((err: Error) => {
            if (!cancelled) {
              setState({ ready: false, error: err.message, userId: null, initDataRaw: raw });
            }
          });
        return;
      }

      if (elapsed >= MAX_WAIT_MS) {
        // Gave up waiting — not running inside Telegram or SDK failed to load
        setState({
          ready: false,
          error: "Please open this app from Telegram",
          userId: null,
          initDataRaw: null,
        });
        return;
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
