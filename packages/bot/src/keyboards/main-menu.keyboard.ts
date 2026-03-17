import { Keyboard } from "grammy";
import type { Translations } from "@metabox/shared";
import { config } from "@metabox/shared";

export function buildMainMenuKeyboard(t: Translations): Keyboard {
  const kb = new Keyboard()
    .text(t.menu.gpt)
    .text(t.menu.design)
    .row()
    .text(t.menu.audio)
    .text(t.menu.video)
    .row();

  const webappUrl = config.bot.webappUrl;
  if (webappUrl) {
    kb.webApp(t.menu.storage, `${webappUrl}#gallery`);
  } else {
    kb.text(t.menu.storage);
  }

  return kb
    .text(t.menu.profile)
    .row()
    .text(t.menu.help)
    .text(t.menu.knowledgeBase)
    .resized()
    .persistent();
}
