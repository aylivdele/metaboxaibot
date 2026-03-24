import { createHmac } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db.js";
import { config, verifyWebToken } from "@metabox/shared";

/**
 * Verifies a Telegram Mini App initData string.
 * Returns the parsed user_id if valid, throws otherwise.
 */
export function verifyTelegramInitData(initDataRaw: string): bigint {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) throw new Error("Missing hash in initData");

  params.delete("hash");

  // Build data_check_string: sorted key=value pairs joined by \n
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // HMAC-SHA256("WebAppData", botToken) → secret key
  const secretKey = createHmac("sha256", "WebAppData").update(config.bot.token).digest();
  // HMAC-SHA256(dataCheckString, secretKey)
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) throw new Error("Invalid initData hash");

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("No user in initData");
  const user = JSON.parse(userRaw) as { id: number };
  return BigInt(user.id);
}

/**
 * Fastify preHandler that verifies Telegram initData from the
 * "Authorization: tma {initDataRaw}" header and sets request.userId.
 */
export async function telegramAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.code(401).send({ error: "Missing Telegram auth" });
  }

  let userId: bigint;
  if (authHeader.startsWith("tma ")) {
    try {
      userId = verifyTelegramInitData(authHeader.slice(4));
    } catch (err) {
      return reply.code(401).send({ error: "Invalid Telegram auth", detail: String(err) });
    }
  } else if (authHeader.startsWith("wtoken ")) {
    // URL-based HMAC token issued by the bot for KeyboardButtonWebApp launches
    try {
      userId = verifyWebToken(authHeader.slice(7), config.bot.token);
    } catch (err) {
      return reply.code(401).send({ error: "Invalid web token", detail: String(err) });
    }
  } else {
    return reply.code(401).send({ error: "Unsupported auth scheme" });
  }

  // Attach to request so route handlers can use it
  (request as FastifyRequest & { userId: bigint }).userId = userId;

  // Ensure user exists (the bot may not have /start-ed yet in some edge cases)
  const user = await db.user.findUnique({
    where: { id: (request as FastifyRequest & { userId: bigint }).userId },
  });
  if (!user) return reply.code(404).send({ error: "User not found" });
  if (user.isBlocked) return reply.code(403).send({ error: "User is blocked" });
  (
    request as FastifyRequest & {
      userId: bigint;
      user: {
        id: bigint;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        language: string;
        isNew: boolean;
        isBlocked: boolean;
        referredById: bigint | null;
        metaboxUserId: string | null;
        metaboxReferralCode: string | null;
        createdAt: Date;
        updatedAt: Date;
      };
    }
  ).user = user;
}
