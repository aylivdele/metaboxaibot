import { InlineKeyboard } from "grammy";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@metabox/shared";

export function buildLanguageKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += 2) {
    const lang1 = SUPPORTED_LANGUAGES[i];
    const lang2 = SUPPORTED_LANGUAGES[i + 1];
    kb.text(LANGUAGE_LABELS[lang1], `lang_${lang1}`);
    if (lang2) kb.text(LANGUAGE_LABELS[lang2], `lang_${lang2}`);
    kb.row();
  }
  return kb;
}
