/**
 * HMAC-signed download tokens for secure S3 file access.
 *
 * Token format: `<base64url-payload>.<hmac-hex>`
 * Payload JSON: { k: s3Key, u: userId, e: expUnixSec }
 *
 * The route /download/:token validates the token, generates a fresh
 * presigned S3 URL, and redirects the user there (302).
 *
 * Secret: METABOX_SSO_SECRET (falls back to BOT_TOKEN so it always works).
 */

import { createHmac } from "node:crypto";
import { config } from "@metabox/shared";

const TOKEN_TTL_SEC = 86_400; // 24 hours

interface TokenPayload {
  k: string; // s3Key
  u: string; // userId
  e: number; // expiry unix seconds
}

function getSecret(): string {
  return config.metabox.ssoSecret ?? config.bot.token;
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

function sign(rawPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(rawPayload).digest("hex");
}

export function generateDownloadToken(s3Key: string, userId: bigint | string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload: TokenPayload = { k: s3Key, u: String(userId), e: exp };
  const rawPayload = b64urlEncode(JSON.stringify(payload));
  const hmac = sign(rawPayload, getSecret());
  return `${rawPayload}.${hmac}`;
}

export function verifyDownloadToken(token: string): TokenPayload {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) throw new Error("Invalid download token format");

  const rawPayload = token.slice(0, dotIdx);
  const hmac = token.slice(dotIdx + 1);

  const expected = sign(rawPayload, getSecret());
  if (expected !== hmac) throw new Error("Invalid download token signature");

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(rawPayload)) as TokenPayload;
  } catch {
    throw new Error("Invalid download token payload");
  }

  if (!payload.k || !payload.u || !payload.e) throw new Error("Malformed download token payload");
  if (Math.floor(Date.now() / 1000) > payload.e) throw new Error("Download token expired");

  return payload;
}
