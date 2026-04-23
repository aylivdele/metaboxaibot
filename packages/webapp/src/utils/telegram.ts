/**
 * Collapse the mini-app to a floating bubble so the user lands back in the chat.
 * `close` requires Bot API 9.0+ (mobile clients). Silent no-op on desktop/web
 * or older clients where the method is missing.
 */
export function closeMiniApp(): void {
  const tg = (window as Window & { Telegram?: { WebApp?: { close?: () => void } } }).Telegram
    ?.WebApp;
  if (typeof tg?.close === "function") tg.close();
}

/**
 * Open an external URL through the Telegram WebApp SDK so the link opens
 * in the system browser (instead of inside the WebView, where downloads
 * silently fail). Falls back to window.open when the SDK is unavailable.
 */
export function openExternalLink(url: string): void {
  const tg = (window as Window & { Telegram?: { WebApp?: { openLink?: (u: string) => void } } })
    .Telegram?.WebApp;
  if (typeof tg?.openLink === "function") tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
