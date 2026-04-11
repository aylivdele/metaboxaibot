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
