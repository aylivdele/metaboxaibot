import { InlineKeyboard } from "grammy";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@metabox/shared";

export function buildLanguageKeyboard(prefix: "lang_" | "langset_" = "lang_"): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += 2) {
    const lang1 = SUPPORTED_LANGUAGES[i];
    const lang2 = SUPPORTED_LANGUAGES[i + 1];
    kb.text(LANGUAGE_LABELS[lang1], `${prefix}${lang1}`);
    if (lang2) kb.text(LANGUAGE_LABELS[lang2], `${prefix}${lang2}`);
    kb.row();
  }
  return kb;
}
