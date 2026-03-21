import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Locale = "en" | "ru";

const translations = {
  en: {
    // Header
    "app.name": "Metabox",

    // Bottom Nav
    "nav.profile": "Profile",
    "nav.manage": "Manage",
    "nav.tariffs": "Tariffs",
    "nav.referral": "Referral",
    "nav.admin": "Admin",
    "nav.gallery": "Gallery",

    // Profile
    "profile.balance": "Token Balance",
    "profile.referrals": "Referrals",
    "profile.txHistory": "Transaction History",
    "profile.noTx": "No transactions yet",
    "profile.reason.welcome_bonus": "🎁 Welcome bonus",
    "profile.reason.ai_usage": "🤖 AI usage",
    "profile.reason.purchase": "💳 Token purchase",
    "profile.reason.referral_bonus": "🎁 Referral bonus",
    "profile.reason.admin": "🔧 Admin adjustment",

    // Banner
    "banner.welcome.title": "Welcome to Metabox",
    "banner.welcome.text": "70+ AI tools in one place",
    "banner.tokens.title": "Get more tokens",
    "banner.tokens.text": "Purchase token packages to unlock all features",
    "banner.referral.title": "Invite friends",
    "banner.referral.text": "Earn bonus tokens for every referral",

    // Management
    "manage.title": "Dialogs",
    "manage.subtitle": "Manage your AI conversations",
    "manage.newDialog": "＋ New dialog",
    "manage.chooseModel": "Choose a model",
    "manage.noModels": "No models available",
    "manage.noDialogs": "No dialogs yet",
    "manage.history": "History",
    "manage.back": "← Back",
    "manage.noMessages": "No messages yet",
    "manage.activate": "Select",

    // Tariffs
    "tariffs.title": "Token Packages",
    "tariffs.currentBalance": "Current balance",
    "tariffs.tokens": "tokens",
    "tariffs.description":
      "Tokens are used for all AI requests. 1 token ≈ 1 image or 50 GPT messages.",
    "tariffs.popular": "Popular",
    "tariffs.buy": "Buy",
    "tariffs.buying": "…",
    "tariffs.note": "Payments are processed securely via Telegram Stars.",
    "tariffs.note2": "Tokens are credited instantly after payment.",
    "tariffs.openInTg": "Open this page inside Telegram to pay with Stars.",
    "tariffs.success": "tokens credited to your balance!",
    "tariffs.failed": "Payment failed. Please try again.",
    "tariffs.invoiceError": "Could not create invoice. Please try again.",

    // Referral
    "referral.title": "Referral Program",
    "referral.subtitle":
      "Invite friends and earn tokens for every new user who joins via your link.",
    "referral.invited": "Friends invited",
    "referral.perReferral": "Tokens per referral",
    "referral.yourLink": "Your referral link",
    "referral.copy": "Copy link",
    "referral.copied": "✓ Copied!",
    "referral.share": "Share",
    "referral.howTitle": "How it works",
    "referral.step1": "Share your unique link with friends",
    "referral.step2": "Friend opens the bot via your link",
    "referral.step3": "You both receive bonus tokens",

    // Admin
    "admin.title": "Admin Panel",
    "admin.subtitle": "User management",
    "admin.searchPlaceholder": "Search by name or username…",
    "admin.noUsers": "No users found",
    "admin.role": "Role",
    "admin.balance": "Balance",
    "admin.joined": "Joined",
    "admin.blocked": "Blocked",
    "admin.actions": "Actions",
    "admin.grant": "Grant tokens",
    "admin.grantAmount": "Amount",
    "admin.grantSubmit": "Grant",
    "admin.block": "Block",
    "admin.unblock": "Unblock",
    "admin.makeAdmin": "Make admin",
    "admin.makeModerator": "Make moderator",
    "admin.makeUser": "Make user",
    "admin.totalUsers": "Total users",
    "admin.prevPage": "← Prev",
    "admin.nextPage": "Next →",
    "admin.accessDenied": "Access denied",
    "admin.accessDeniedText": "You don't have admin privileges.",
    "admin.tabUsers": "Users",
    "admin.tabSlides": "Slides",
    "admin.slides.title": "Banner Slides",
    "admin.slides.empty": "No slides yet",
    "admin.slides.add": "Add slide",
    "admin.slides.imageLabel": "Banner image",
    "admin.slides.aspectHint": "Recommended: 3:1 (e.g. 900×300)",
    "admin.slides.chooseFile": "Choose file",
    "admin.slides.linkUrl": "Link URL (optional)",
    "admin.slides.linkPlaceholder": "https://example.com",
    "admin.slides.duration": "Duration (seconds)",
    "admin.slides.save": "Save",
    "admin.slides.cancel": "Cancel",
    "admin.slides.delete": "Delete",
    "admin.slides.confirmDelete": "Delete this slide?",
    "admin.slides.moveUp": "Move up",
    "admin.slides.moveDown": "Move down",
    "admin.slides.active": "Active",
    "admin.slides.inactive": "Inactive",
    "admin.slides.uploading": "Uploading…",

    // Gallery
    "gallery.title": "My Files",
    "gallery.subtitle": "All generated images, audio, and videos",
    "gallery.section.image": "Images",
    "gallery.section.audio": "Audio",
    "gallery.section.video": "Videos",
    "gallery.empty": "No files in this section yet",
    "gallery.download": "Send to chat",
    "gallery.sent": "✓ Sent!",

    // Language
    "lang.title": "Language",

    // Common
    "common.loading": "Loading…",
    "common.error": "Error",
  },
  ru: {
    // Header
    "app.name": "Metabox",

    // Bottom Nav
    "nav.profile": "Профиль",
    "nav.manage": "Диалоги",
    "nav.tariffs": "Тарифы",
    "nav.referral": "Рефералы",
    "nav.admin": "Админ",
    "nav.gallery": "Галерея",

    // Profile
    "profile.balance": "Баланс токенов",
    "profile.referrals": "Рефералы",
    "profile.txHistory": "История транзакций",
    "profile.noTx": "Транзакций пока нет",
    "profile.reason.welcome_bonus": "🎁 Приветственный бонус",
    "profile.reason.ai_usage": "🤖 Использование AI",
    "profile.reason.purchase": "💳 Покупка токенов",
    "profile.reason.referral_bonus": "🎁 Реферальный бонус",
    "profile.reason.admin": "🔧 Корректировка",

    // Banner
    "banner.welcome.title": "Добро пожаловать",
    "banner.welcome.text": "70+ AI инструментов в одном месте",
    "banner.tokens.title": "Больше токенов",
    "banner.tokens.text": "Покупайте пакеты для доступа ко всем функциям",
    "banner.referral.title": "Пригласи друзей",
    "banner.referral.text": "Получай бонусные токены за каждого реферала",

    // Management
    "manage.title": "Диалоги",
    "manage.subtitle": "Управление AI-диалогами",
    "manage.newDialog": "＋ Новый диалог",
    "manage.chooseModel": "Выберите модель",
    "manage.noModels": "Нет доступных моделей",
    "manage.noDialogs": "Диалогов пока нет",
    "manage.history": "История",
    "manage.back": "← Назад",
    "manage.noMessages": "Сообщений пока нет",
    "manage.activate": "Выбрать",

    // Tariffs
    "tariffs.title": "Пакеты токенов",
    "tariffs.currentBalance": "Текущий баланс",
    "tariffs.tokens": "токенов",
    "tariffs.description":
      "Токены используются для всех AI-запросов. 1 токен ≈ 1 изображение или 50 GPT-сообщений.",
    "tariffs.popular": "Популярный",
    "tariffs.buy": "Купить",
    "tariffs.buying": "…",
    "tariffs.note": "Оплата безопасно проводится через Telegram Stars.",
    "tariffs.note2": "Токены зачисляются мгновенно после оплаты.",
    "tariffs.openInTg": "Откройте страницу в Telegram для оплаты через Stars.",
    "tariffs.success": "токенов зачислено на ваш баланс!",
    "tariffs.failed": "Оплата не удалась. Попробуйте снова.",
    "tariffs.invoiceError": "Не удалось создать счёт. Попробуйте снова.",

    // Referral
    "referral.title": "Реферальная программа",
    "referral.subtitle": "Приглашайте друзей и получайте токены за каждого нового пользователя.",
    "referral.invited": "Друзей приглашено",
    "referral.perReferral": "Токенов за реферала",
    "referral.yourLink": "Ваша реферальная ссылка",
    "referral.copy": "Копировать",
    "referral.copied": "✓ Скопировано!",
    "referral.share": "Поделиться",
    "referral.howTitle": "Как это работает",
    "referral.step1": "Поделитесь своей ссылкой с друзьями",
    "referral.step2": "Друг открывает бота по вашей ссылке",
    "referral.step3": "Вы оба получаете бонусные токены",

    // Admin
    "admin.title": "Админ-панель",
    "admin.subtitle": "Управление пользователями",
    "admin.searchPlaceholder": "Поиск по имени или логину…",
    "admin.noUsers": "Пользователи не найдены",
    "admin.role": "Роль",
    "admin.balance": "Баланс",
    "admin.joined": "Дата регистрации",
    "admin.blocked": "Заблокирован",
    "admin.actions": "Действия",
    "admin.grant": "Начислить токены",
    "admin.grantAmount": "Количество",
    "admin.grantSubmit": "Начислить",
    "admin.block": "Заблокировать",
    "admin.unblock": "Разблокировать",
    "admin.makeAdmin": "Сделать админом",
    "admin.makeModerator": "Сделать модератором",
    "admin.makeUser": "Сделать юзером",
    "admin.totalUsers": "Всего пользователей",
    "admin.prevPage": "← Назад",
    "admin.nextPage": "Далее →",
    "admin.accessDenied": "Доступ запрещён",
    "admin.accessDeniedText": "У вас нет прав администратора.",
    "admin.tabUsers": "Пользователи",
    "admin.tabSlides": "Слайды",
    "admin.slides.title": "Баннерные слайды",
    "admin.slides.empty": "Слайдов пока нет",
    "admin.slides.add": "Добавить слайд",
    "admin.slides.imageLabel": "Изображение баннера",
    "admin.slides.aspectHint": "Рекомендуемое: 3:1 (напр. 900×300)",
    "admin.slides.chooseFile": "Выбрать файл",
    "admin.slides.linkUrl": "Ссылка (необязательно)",
    "admin.slides.linkPlaceholder": "https://example.com",
    "admin.slides.duration": "Длительность (секунды)",
    "admin.slides.save": "Сохранить",
    "admin.slides.cancel": "Отмена",
    "admin.slides.delete": "Удалить",
    "admin.slides.confirmDelete": "Удалить этот слайд?",
    "admin.slides.moveUp": "Вверх",
    "admin.slides.moveDown": "Вниз",
    "admin.slides.active": "Активен",
    "admin.slides.inactive": "Неактивен",
    "admin.slides.uploading": "Загрузка…",

    // Gallery
    "gallery.title": "Мои файлы",
    "gallery.subtitle": "Все сгенерированные изображения, аудио и видео",
    "gallery.section.image": "Изображения",
    "gallery.section.audio": "Аудио",
    "gallery.section.video": "Видео",
    "gallery.empty": "В этом разделе пока нет файлов",
    "gallery.download": "Отправить в чат",
    "gallery.sent": "✓ Отправлено!",

    // Language
    "lang.title": "Язык",

    // Common
    "common.loading": "Загрузка…",
    "common.error": "Ошибка",
  },
} as const;

type TranslationKey = keyof (typeof translations)["en"];

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("metabox_lang");
    if (saved === "ru" || saved === "en") return saved;
    const nav = navigator.language.slice(0, 2);
    return nav === "ru" ? "ru" : "en";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("metabox_lang", l);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[locale]?.[key] ?? translations.en[key] ?? key;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
