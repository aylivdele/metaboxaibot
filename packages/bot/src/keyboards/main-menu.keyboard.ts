import { Keyboard } from "grammy";
import type { Translations } from "@metabox/shared";
import { config, generateWebToken } from "@metabox/shared";

export function buildMainMenuKeyboard(t: Translations, userId?: bigint): Keyboard {
  const webappUrl = config.bot.webappUrl;
  const kb = new Keyboard();

  if (webappUrl && userId) {
    const token = generateWebToken(userId, config.bot.token);
    kb.webApp(t.menu.profile, `${webappUrl}?page=profile&wtoken=${token}`);
  } else if (webappUrl) {
    kb.webApp(t.menu.profile, `${webappUrl}?page=profile`);
  } else {
    kb.text(t.menu.profile);
  }

  kb.row().text(t.menu.gpt).text(t.menu.design).row().text(t.menu.audio).text(t.menu.video).row();

  if (webappUrl && userId) {
    const token = generateWebToken(userId, config.bot.token);
    kb.row().webApp(t.menu.storage, `${webappUrl}?page=profile&section=gallery&wtoken=${token}`);
  } else if (webappUrl) {
    kb.row().webApp(t.menu.storage, `${webappUrl}?page=gallery`);
  } else {
    kb.row().text(t.menu.storage);
  }

  return kb.text(t.menu.help).text(t.menu.knowledgeBase).resized().persistent();
}
