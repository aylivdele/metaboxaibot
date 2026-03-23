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
    throw new Error(`Metabox internal API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const { url } = base();
  const res = await fetch(`${url}/api${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metabox API GET ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── API methods ───────────────────────────────────────────────────────────────

export interface RegisterFromBotResult {
  metaboxUserId: string;
  ssoToken: string;
  referralCode: string;
}

/** Register a new Metabox user from the bot (email + password). */
export async function registerFromBot(params: {
  email: string;
  password: string;
  telegramId: bigint;
  firstName?: string;
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
}): Promise<RegisterFromBotResult> {
  return post<RegisterFromBotResult>("/login-and-link", {
    ...params,
    telegramId: params.telegramId.toString(),
  });
}

/** Verify a TelegramAuthToken created by Metabox (for Metabox→Bot deep link flow).
 *  Also tells Metabox to link telegramId to the user account. */
export async function verifyLinkToken(
  token: string,
  telegramId: bigint,
): Promise<{
  metaboxUserId: string;
  email: string;
  firstName: string;
}> {
  return post("/verify-link-token", { token, telegramId: telegramId.toString() });
}

/** Issue a fresh SSO token for an already-linked user. */
export async function issueSsoTokenRemote(metaboxUserId: string): Promise<{ ssoToken: string }> {
  return post("/issue-sso-token", { metaboxUserId });
}

/** Notify Metabox of a token purchase made inside the bot (for MLM bonus calculation). */
export async function recordSale(params: {
  telegramId: bigint;
  productId?: string;
  tokens: number;
  priceRub: number;
  marginRub: number;
}): Promise<void> {
  await post("/record-sale", {
    ...params,
    telegramId: params.telegramId.toString(),
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
