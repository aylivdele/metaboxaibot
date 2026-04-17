/**
 * Web-сессии: access (JWT, в памяти у клиента) + refresh (opaque, в Redis + httpOnly cookie).
 *
 * Только для packages/web (ai.metabox.global) — Telegram-аутентификация бота
 * обрабатывается отдельно (через initData в `middlewares/telegram-auth.ts`).
 *
 * НИЧЕГО из старых flow'ов не меняет.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getRedis } from "../redis.js";
import { config } from "@metabox/shared";

const REFRESH_KEY_PREFIX = "web:refresh:";
const PASSWORD_RESET_KEY_PREFIX = "web:pwreset:";
const LINK_STATE_KEY_PREFIX = "web:link:";

export interface WebSession {
  /** Всегда есть: UUID юзера в MetaBox (источник правды для identity). */
  metaboxUserId: string;
  /**
   * AI Box User.id (BigInt as string) — появляется только после привязки Telegram.
   * null означает: юзер зарегистрирован на вебе, но ещё не связал TG-бота.
   * В этом состоянии на вебе НЕ доступны чаты, токены, галерея, подписки.
   */
  aibUserId: string | null;
  email: string;
  firstName: string | null;
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
  rememberMe: boolean;
  userAgent?: string;
  ip?: string;
}

export interface AccessTokenClaims {
  /** MetaBox user ID (всегда). */
  sub: string;
  /** AI Box user ID (опционально, только если юзер привязал TG). */
  aib?: string;
  /** Session id — усечённый HMAC refresh-токена (для отзыва). */
  sid: string;
  iat: number;
  exp: number;
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function b64url(data: Buffer | string): string {
  return (data instanceof Buffer ? data : Buffer.from(data))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlParse(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function getJwtSecret(): string {
  const s = config.web.jwtSecret;
  if (!s) throw new Error("WEB_JWT_SECRET is not set");
  return s;
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex"); // 64 символа
}

export function generateCsrfToken(): string {
  return randomBytes(24).toString("hex"); // 48 символов
}

// ── JWT (HMAC-SHA256) — без сторонних зависимостей ──────────────────────────

export function signAccessToken(claims: Omit<AccessTokenClaims, "iat" | "exp">): {
  token: string;
  expiresAt: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.web.accessTtlSeconds;
  const payload: AccessTokenClaims = { ...claims, iat: now, exp };

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = b64url(createHmac("sha256", getJwtSecret()).update(data).digest());

  return { token: `${data}.${sig}`, expiresAt: exp * 1000 };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [header, body, sig] = parts;

  const expected = createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest();
  const given = b64urlParse(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Error("Invalid JWT signature");
  }

  const claims = JSON.parse(b64urlParse(body).toString()) as AccessTokenClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) throw new Error("JWT expired");

  return claims;
}

// ── Refresh session (Redis) ─────────────────────────────────────────────────

export async function createRefreshSession(
  session: Omit<WebSession, "createdAt" | "expiresAt" | "csrfToken"> & {
    rememberMe: boolean;
  },
): Promise<{ refreshToken: string; csrfToken: string; session: WebSession }> {
  const redis = getRedis();
  const refreshToken = generateRefreshToken();
  const csrfToken = generateCsrfToken();
  const ttlSec = session.rememberMe
    ? config.web.refreshTtlSeconds
    : Math.min(config.web.refreshTtlSeconds, 24 * 60 * 60); // 24ч если не rememberMe
  const now = Date.now();

  const full: WebSession = {
    ...session,
    createdAt: now,
    expiresAt: now + ttlSec * 1000,
    csrfToken,
  };

  await redis.set(REFRESH_KEY_PREFIX + refreshToken, JSON.stringify(full), "EX", ttlSec);
  return { refreshToken, csrfToken, session: full };
}

export async function getRefreshSession(refreshToken: string): Promise<WebSession | null> {
  const redis = getRedis();
  const raw = await redis.get(REFRESH_KEY_PREFIX + refreshToken);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebSession;
  } catch {
    return null;
  }
}

/** Продлевает TTL refresh-сессии (sliding expiration) при каждом рефреше. */
export async function touchRefreshSession(
  refreshToken: string,
  session: WebSession,
): Promise<{ csrfToken: string }> {
  const redis = getRedis();
  // Поворачиваем CSRF на каждый рефреш — защита от кражи
  session.csrfToken = generateCsrfToken();
  const ttlSec = Math.max(Math.floor((session.expiresAt - Date.now()) / 1000), 60);
  await redis.set(REFRESH_KEY_PREFIX + refreshToken, JSON.stringify(session), "EX", ttlSec);
  return { csrfToken: session.csrfToken };
}

export async function revokeRefreshSession(refreshToken: string): Promise<void> {
  const redis = getRedis();
  await redis.del(REFRESH_KEY_PREFIX + refreshToken);
}

/** Session ID для JWT — усечённый hash refresh-токена (не раскрывает сам токен). */
export function sessionIdFromRefresh(refreshToken: string): string {
  return createHmac("sha256", getJwtSecret()).update(refreshToken).digest("hex").slice(0, 16);
}

// ── Password reset (Redis) ──────────────────────────────────────────────────
/**
 * Мы НЕ храним reset-токены на стороне AI Box — их выдаёт meta-box
 * (у него есть таблица `PasswordResetToken` в схеме основного сайта).
 * Здесь только троттлинг повторных запросов с одного email.
 */

export async function canRequestPasswordReset(email: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${PASSWORD_RESET_KEY_PREFIX}throttle:${email.toLowerCase()}`;
  const ok = await redis.set(key, "1", "EX", 60, "NX"); // 1 запрос в минуту
  return ok === "OK";
}

// ── Link Telegram state (Redis) ─────────────────────────────────────────────

export async function createLinkTelegramState(userId: string): Promise<string> {
  const redis = getRedis();
  const state = randomBytes(16).toString("hex");
  await redis.set(`${LINK_STATE_KEY_PREFIX}state:${state}`, userId, "EX", 10 * 60);
  return state;
}

export async function consumeLinkTelegramState(state: string): Promise<string | null> {
  const redis = getRedis();
  const userId = await redis.get(`${LINK_STATE_KEY_PREFIX}state:${state}`);
  if (!userId) return null;
  // НЕ удаляем сразу — бот-handler удалит после успешной привязки.
  // Здесь только читаем для проверки.
  return userId;
}

/** Вызывается ботом при успешной привязке. */
export async function markLinkTelegramLinked(
  state: string,
  telegramId: string,
  telegramUsername: string | null,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `${LINK_STATE_KEY_PREFIX}linked:${state}`,
    JSON.stringify({ telegramId, telegramUsername }),
    "EX",
    10 * 60,
  );
  await redis.del(`${LINK_STATE_KEY_PREFIX}state:${state}`);
}

/** Фронт поллит — вернулось ли подтверждение от бота. */
export async function checkLinkTelegramLinked(
  state: string,
): Promise<{ telegramId: string; telegramUsername: string | null } | null> {
  const redis = getRedis();
  const raw = await redis.get(`${LINK_STATE_KEY_PREFIX}linked:${state}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { telegramId: string; telegramUsername: string | null };
  } catch {
    return null;
  }
}
