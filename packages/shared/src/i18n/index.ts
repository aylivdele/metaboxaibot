import type { Language } from "../types/user.js";

export interface Translations {
  start: {
    welcome: string;
    tokensGranted: string;
    videoIntro: string;
    mainMenuTitle: string;
    community: string;
    support: string;
    howToVideo_vk: string;
    howToVideo_yt: string;
    knowledgeBase: string;
    channel: string;
  };
  menu: {
    profile: string;
    gpt: string;
    design: string;
    audio: string;
    video: string;
    storage: string;
    help: string;
    knowledgeBase: string;
  };
  gpt: {
    sectionTitle: string;
    activateEditor: string;
    management: string;
    newDialog: string;
    prompts: string;
    gptEditorActivated: string;
    newDialogCreated: string;
    backToMain: string;
  };
  design: {
    sectionTitle: string;
    management: string;
    newDialog: string;
    backToMain: string;
  };
  audio: {
    sectionTitle: string;
    tts: string;
    voiceClone: string;
    music: string;
    sounds: string;
    backToMain: string;
  };
  video: {
    sectionTitle: string;
    avatars: string;
    lipSync: string;
    newDialog: string;
    backToMain: string;
  };
  errors: {
    noTool: string;
    unexpected: string;
    insufficientTokens: string;
    userBlocked: string;
  };
  common: {
    backToMain: string;
    profile: string;
    knowledgeBase: string;
    management: string;
    newDialog: string;
  };
}

const cache = new Map<Language, Translations>();

async function loadLocale(lang: Language): Promise<Translations> {
  const mod = await import(`./locales/${lang}.js`);
  return mod.default as Translations;
}

/**
 * Загружает переводы при старте приложения.
 * Языки без перевода автоматически используют английский как fallback.
 */
export async function preloadLocales(languages: Language[]): Promise<void> {
  await Promise.all(
    languages.map(async (lang) => {
      try {
        cache.set(lang, await loadLocale(lang));
      } catch {
        // Нет файла перевода — будет использован fallback на en
      }
    }),
  );
}

/**
 * Синхронно возвращает перевод для указанного языка.
 * Требует предварительного вызова preloadLocales().
 */
export function getT(lang: Language): Translations {
  return cache.get(lang) ?? (cache.get("en") as Translations);
}
