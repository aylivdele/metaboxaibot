import { Keyboard } from "grammy";
import type { Translations } from "@metabox/shared";
import { config } from "@metabox/shared";

export function buildMainMenuKeyboard(t: Translations): Keyboard {
  const webappUrl = config.bot.webappUrl;
  const kb = new Keyboard();

  // Profile — full-width first row, opens mini app directly if configured
  if (webappUrl) {
    kb.webApp(t.menu.profile, `${webappUrl}#profile`);
  } else {
    kb.text(t.menu.profile);
  }

  kb.row()
    .text(t.menu.gpt)
    .text(t.menu.design)
    .row()
    .text(t.menu.audio)
    .text(t.menu.video)
    .row();

  if (webappUrl) {
    kb.webApp(t.menu.storage, `${webappUrl}#gallery`);
  } else {
    kb.text(t.menu.storage);
  }

  return kb
    .row()
    .text(t.menu.help)
    .text(t.menu.knowledgeBase)
    .resized()
    .persistent();
}
