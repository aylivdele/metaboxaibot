import type { Language } from "../types/user.js";

export const SUPPORTED_LANGUAGES: Language[] = [
  "en",
  "ru",
  "lv",
  "ua",
  "tr",
  "ge",
  "uz",
  "kz",
  "de",
  "es",
  "it",
  "fr",
  "ar",
  "he",
];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "🇬🇧 English",
  ru: "🇷🇺 Русский",
  lv: "🇱🇻 Latviešu",
  ua: "🇺🇦 Українська",
  tr: "🇹🇷 Türkçe",
  ge: "🇬🇪 ქართული",
  uz: "🇺🇿 O'zbekcha",
  kz: "🇰🇿 Қазақ тілі",
  de: "🇩🇪 Deutsch",
  es: "🇪🇸 Español",
  it: "🇮🇹 Italiano",
  fr: "🇫🇷 Français",
  ar: "🇸🇦 العربية",
  he: "🇮🇱 עברית",
};

export const RTL_LANGUAGES: Language[] = ["ar", "he"];
