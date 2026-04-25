/** Общие типы API-ответов. Серверные DTO из packages/api. */

export interface WebUser {
  /** AI Box User.id — null если TG не привязан. */
  id: string | null;
  metaboxUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  language: "ru" | "en";
  telegramId: string | null;
  telegramUsername: string | null;
  /** true если Telegram-бот привязан. Если false — чат/токены/галерея недоступны. */
  isTelegramLinked: boolean;
  tokenBalance: string; // BigInt сериализуется в string
  subscriptionTokenBalance?: string;
  role?: "USER" | "MODERATOR" | "ADMIN";
  createdAt: string;
}

export interface AuthSession {
  user: WebUser;
  accessToken: string;
  csrfToken: string;
  /** Unix timestamp (ms) окончания срока access token */
  accessTokenExpiresAt: number;
}

export interface SubscriptionInfo {
  id: string;
  planId: string;
  planName: string;
  status: "active" | "canceled" | "expired";
  currentPeriodEnd: string; // ISO date
  autoRenew: boolean;
}
