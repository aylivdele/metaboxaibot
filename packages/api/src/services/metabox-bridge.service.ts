/**
 * MetaboxBridgeService — HTTP client for calling Metabox internal API.
 *
 * All calls require METABOX_API_URL + METABOX_INTERNAL_KEY env vars.
 * If they are not set, methods throw with a descriptive error.
 */
import { config } from "@metabox/shared";
import { createHmac } from "crypto";

// ── SSO token helpers (HMAC-SHA256, no extra deps) ────────────────────────────

const SSO_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function issueSsoToken(metaboxUserId: string): string {
  const secret = config.metabox.ssoSecret;
  if (!secret) throw new Error("METABOX_SSO_SECRET is not set");

  const payload = JSON.stringify({ sub: metaboxUserId, exp: Date.now() + SSO_EXPIRY_MS });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifySsoToken(token: string): string {
  const secret = config.metabox.ssoSecret;
  if (!secret) throw new Error("METABOX_SSO_SECRET is not set");

  const [b64, sig] = token.split(".");
  if (!b64 || !sig) throw new Error("Invalid SSO token format");

  const expected = createHmac("sha256", secret).update(b64).digest("base64url");
  if (sig !== expected) throw new Error("Invalid SSO token signature");

  const payload = JSON.parse(Buffer.from(b64, "base64url").toString()) as {
    sub: string;
    exp: number;
  };
  if (Date.now() > payload.exp) throw new Error("SSO token expired");
  return payload.sub;
}

// ── HTTP client ───────────────────────────────────────────────────────────────

function base() {
  const url = config.metabox.apiUrl;
  const key = config.metabox.internalKey;
  if (!url || !key) throw new Error("METABOX_API_URL / METABOX_INTERNAL_KEY not set");
  return { url, key };
}

export class MetaboxApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    path: string,
    public readonly code?: string,
  ) {
    super(`Metabox internal API ${path} → ${status}: ${body}`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { url, key } = base();
  const res = await fetch(`${url}/api/internal${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string };
      if (parsed.error) message = parsed.error;
      if (parsed.code) code = parsed.code;
    } catch {
      // keep raw text
    }
    throw new MetaboxApiError(res.status, message, path, code);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const { url, key } = base();
  const res = await fetch(`${url}/api${path}`, {
    headers: { "X-Internal-Key": key },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metabox API GET ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── API methods ───────────────────────────────────────────────────────────────

export interface MergedAccountInfo {
  userId: string;
  tokensBalance: number;
  subscriptionDays: number;
}

export interface RegisterFromBotResult {
  metaboxUserId: string;
  ssoToken: string;
  referralCode: string;
  mergedFrom?: MergedAccountInfo;
}

/** Register a new Metabox user from the bot (email + password). */
export async function registerFromBot(params: {
  email: string;
  password: string;
  telegramId: bigint;
  firstName?: string;
  lastName?: string;
  username?: string;
  referrerTelegramId?: bigint;
}): Promise<RegisterFromBotResult> {
  return post<RegisterFromBotResult>("/register-from-bot", {
    ...params,
    telegramId: params.telegramId.toString(),
    referrerTelegramId: params.referrerTelegramId?.toString(),
  });
}

/** Login existing Metabox user and link their Telegram account. */
export async function loginAndLink(params: {
  email: string;
  password: string;
  telegramId: bigint;
  telegramUsername: string | null;
  referrerTelegramId?: bigint | null;
  botHasPurchase: boolean;
  botCreatedAt: Date;
}): Promise<RegisterFromBotResult> {
  return post<RegisterFromBotResult>("/login-and-link", {
    email: params.email,
    password: params.password,
    telegramId: params.telegramId.toString(),
    telegramUsername: params.telegramUsername,
    referrerTelegramId: params.referrerTelegramId?.toString(),
    botHasPurchase: params.botHasPurchase,
    botCreatedAt: params.botCreatedAt.toISOString(),
  });
}

/** Verify a TelegramAuthToken created by Metabox (for Metabox→Bot deep link flow).
 *  Also tells Metabox to link telegramId to the user account. */
export async function verifyLinkToken(
  token: string,
  telegramId: bigint,
  botInfo?: {
    referrerTelegramId?: bigint | null;
    botHasPurchase: boolean;
    botCreatedAt: Date;
  },
): Promise<{
  metaboxUserId: string;
  email: string;
  firstName: string;
  referralCode: string;
  mergedFrom?: MergedAccountInfo;
}> {
  return post("/verify-link-token", {
    token,
    telegramId: telegramId.toString(),
    referrerTelegramId: botInfo?.referrerTelegramId?.toString(),
    botHasPurchase: botInfo?.botHasPurchase,
    botCreatedAt: botInfo?.botCreatedAt.toISOString(),
  });
}

/** Issue a fresh SSO token for an already-linked user. */
export async function issueSsoTokenRemote(metaboxUserId: string): Promise<{ ssoToken: string }> {
  return post("/issue-sso-token", { metaboxUserId });
}

export interface RecordSaleResult {
  ok: boolean;
  userId?: string;
  orderId?: string;
}

/** Notify Metabox of a purchase made inside the bot (for MLM bonus calculation + order tracking). */
export async function recordSale(params: {
  telegramId: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
  productType: "product" | "subscription";
  productId: string;
  period?: "M1" | "M3" | "M6" | "M12";
  tokens: number;
  priceRub: number;
  stars: number;
  starRate: number;
  referrerTelegramId?: bigint;
}): Promise<RecordSaleResult> {
  return post<RecordSaleResult>("/record-sale", {
    ...params,
    telegramId: params.telegramId.toString(),
    referrerTelegramId: params.referrerTelegramId?.toString(),
  });
}

// ── AI token product catalog ─────────────────────────────────────────────────

export interface AiBotProduct {
  id: string;
  name: string;
  tokens: number;
  priceRub: string; // Decimal as string
}

/** Fetch the list of active AI token packages from Metabox. */
export async function getAiBotProducts(): Promise<AiBotProduct[]> {
  return get<AiBotProduct[]>("/aibot/products");
}

/**
 * Look up a Metabox user by Telegram ID.
 * Returns null if no account is linked to that Telegram ID on the Metabox side.
 */
export async function lookupByTelegramId(
  telegramId: bigint,
): Promise<{ metaboxUserId: string; referralCode: string } | null> {
  try {
    return await post<{ metaboxUserId: string; referralCode: string }>("/lookup-telegram", {
      telegramId: telegramId.toString(),
    });
  } catch (err) {
    if (err instanceof MetaboxApiError && err.status === 404) return null;
    throw err;
  }
}

// ── Unified catalog (subscriptions + token packages) ────────────────────────

export interface CatalogSubscription {
  id: string;
  name: string;
  tokens: number;
  priceMonthly: string;
  discount3m: string;
  discount6m: string;
  discount12m: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  tokens: number;
  priceRub: string;
  badge: string | null;
}

export interface AiBotCatalog {
  subscriptions: CatalogSubscription[];
  tokenPackages: CatalogProduct[];
}

/** Fetch unified catalog of subscriptions + token packages from Metabox. */
export async function getAiBotCatalog(): Promise<AiBotCatalog> {
  return get<AiBotCatalog>("/aibot/catalog");
}

/** Create a subscription invoice on Metabox for a linked user. */
export async function createSubscriptionInvoice(params: {
  metaboxUserId: string;
  planId: string;
  period: string;
  telegramId: bigint;
}): Promise<{ paymentUrl: string; subscriptionId: string }> {
  return post<{ paymentUrl: string; subscriptionId: string }>("/subscription-invoice", {
    ...params,
    telegramId: params.telegramId.toString(),
  });
}

/** Ask Metabox to create an AiBotOrder + Lava invoice for a linked user. */
export async function createAiBotInvoice(params: {
  metaboxUserId: string;
  productId: string;
  telegramId: bigint;
}): Promise<{ paymentUrl: string; orderId: string }> {
  return post<{ paymentUrl: string; orderId: string }>("/aibot-invoice", {
    ...params,
    telegramId: params.telegramId.toString(),
  });
}
