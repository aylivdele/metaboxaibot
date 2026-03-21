/**
 * Short-lived URL token for Telegram Mini App authentication.
 *
 * Used when initData is unavailable (e.g. KeyboardButtonWebApp / requestSimpleWebView
 * which by Telegram design never injects tgWebAppData).
 *
 * Token format: `<userId>_<timestampSec>_<hmacHex>`
 * HMAC-SHA256 over `<userId>:<timestampSec>` keyed with the bot token.
 * Default TTL: 24 hours.
 */

import { createHmac } from "node:crypto";

const TOKEN_TTL_SEC = 86_400; // 24 h
const SEP = "_";

function sign(payload: string, botToken: string): string {
  return createHmac("sha256", botToken).update(payload).digest("hex");
}

export function generateWebToken(userId: bigint, botToken: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${userId}:${ts}`;
  const hmac = sign(payload, botToken);
  return `${userId}${SEP}${ts}${SEP}${hmac}`;
}

export function verifyWebToken(token: string, botToken: string): bigint {
  const parts = token.split(SEP);
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [userIdStr, tsStr, hmac] = parts;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) throw new Error("Invalid token timestamp");

  const now = Math.floor(Date.now() / 1000);
  if (now - ts > TOKEN_TTL_SEC) throw new Error("Token expired");

  const payload = `${userIdStr}:${ts}`;
  const expected = sign(payload, botToken);
  if (expected !== hmac) throw new Error("Invalid token signature");

  return BigInt(userIdStr);
}
