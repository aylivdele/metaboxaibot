import { useEffect, useState } from "react";
import { setInitDataRaw, api } from "../api/client.js";

export interface TelegramInitState {
  ready: boolean;
  error: string | null;
  userId: string | null;
  initDataRaw: string | null;
}

/**
 * Initializes the Telegram Mini App SDK and verifies auth with the backend.
 * Returns ready=true once the user is authenticated.
 */
export function useTelegramInit(): TelegramInitState {
  const [state, setState] = useState<TelegramInitState>({
    ready: false,
    error: null,
    userId: null,
    initDataRaw: null,
  });

  useEffect(() => {
    const tg = (
      window as Window & { Telegram?: { WebApp?: { initData: string; ready?: () => void } } }
    ).Telegram?.WebApp;

    const raw = tg?.initData ?? "";

    if (!raw) {
      // Dev mode: allow access without real Telegram initData
      if (import.meta.env.DEV) {
        setState({ ready: true, error: null, userId: "dev", initDataRaw: null });
        return;
      }
      setState({
        ready: false,
        error: "Please open this app from Telegram",
        userId: null,
        initDataRaw: null,
      });
      return;
    }

    setInitDataRaw(raw);
    tg?.ready?.();

    api.auth
      .verify(raw)
      .then((user) => {
        setState({ ready: true, error: null, userId: user.id, initDataRaw: raw });
      })
      .catch((err: Error) => {
        setState({ ready: false, error: err.message, userId: null, initDataRaw: raw });
      });
  }, []);

  return state;
}
