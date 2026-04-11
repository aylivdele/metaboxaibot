/**
 * Collapse the mini-app to a floating bubble so the user lands back in the chat.
 * `minimize` requires Bot API 9.0+ (mobile clients). Silent no-op on desktop/web
 * or older clients where the method is missing.
 */
export function minimizeMiniApp(): void {
  const tg = (window as Window & { Telegram?: { WebApp?: { minimize?: () => void } } }).Telegram
    ?.WebApp;
  if (typeof tg?.minimize === "function") tg.minimize();
}
