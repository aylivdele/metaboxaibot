import { Keyboard } from "grammy";
import type { Translations } from "@metabox/shared";
import { config, generateWebToken } from "@metabox/shared";

export function buildMainMenuKeyboard(t: Translations, userId?: bigint): Keyboard {
  const webappUrl = config.bot.webappUrl;
  const kb = new Keyboard();

  // Profile — full-width first row, opens mini app directly if configured.
  // Appends a short-lived HMAC token so the webapp can authenticate even when
  // Telegram's requestSimpleWebView (KeyboardButtonWebApp) doesn't inject initData.
  if (webappUrl) {
    const token = userId ? generateWebToken(userId, config.bot.token) : "";
    const url = token ? `${webappUrl}?page=profile&wtoken=${token}` : `${webappUrl}?page=profile`;
    kb.webApp(t.menu.profile, url);
  } else {
    kb.text(t.menu.profile);
  }

  kb.row().text(t.menu.gpt).text(t.menu.design).row().text(t.menu.audio).text(t.menu.video).row();

  return kb.text(t.menu.help).text(t.menu.knowledgeBase).resized().persistent();
}
