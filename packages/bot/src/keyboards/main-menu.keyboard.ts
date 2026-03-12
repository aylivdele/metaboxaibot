import { Keyboard } from "grammy";
import type { Translations } from "@metabox/shared";

export function buildMainMenuKeyboard(t: Translations): Keyboard {
  return new Keyboard()
    .text(t.menu.gpt)
    .text(t.menu.design)
    .row()
    .text(t.menu.audio)
    .text(t.menu.video)
    .row()
    .text(t.menu.storage)
    .text(t.menu.profile)
    .row()
    .text(t.menu.help)
    .text(t.menu.knowledgeBase)
    .resized()
    .persistent();
}
