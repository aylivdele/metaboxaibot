import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { createHash, randomBytes } from "crypto";
import {
  issueSsoToken,
  issueSsoTokenRemote,
  MetaboxApiError,
} from "../services/metabox-bridge.service.js";
import { config } from "@metabox/shared";

type AuthRequest = FastifyRequest & { userId: bigint };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const expected = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return expected === hash;
}

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /profile — balance + last 20 transactions */
  fastify.get("/profile", async (request) => {
    const { userId } = request as AuthRequest;

    const [user, transactions, referralCount] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.tokenTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.user.count({ where: { referredById: userId } }),
    ]);

    if (!user) throw new Error("User not found");

    return {
      id: user.id.toString(),
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      language: user.language,
      role: user.role,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      metaboxUserId: user.metaboxUserId ?? null,
      metaboxReferralCode: user.metaboxReferralCode ?? null,
      tokenBalance: user.tokenBalance.toString(),
      referralCount,
      createdAt: user.createdAt.toISOString(),
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount.toString(),
        type: t.type,
        reason: t.reason,
        modelId: t.modelId ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  });

  /** PATCH /profile/settings — update email / password */
  fastify.patch("/profile/settings", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const body = request.body as { email?: string; password?: string; oldPassword?: string };

    const data: Record<string, unknown> = {};

    if (body.email !== undefined) {
      data.email = body.email;
      data.emailVerified = false;
    }

    if (body.password) {
      if (body.password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }
      if (body.oldPassword !== undefined) {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true },
        });
        if (!user?.passwordHash || !verifyPassword(body.oldPassword, user.passwordHash)) {
          return reply.code(400).send({ error: "Old password is incorrect" });
        }
      }
      data.passwordHash = hashPassword(body.password);
    }

    const user = await db.user.update({
      where: { id: userId },
      data,
    });

    return {
      email: user.email ?? null,
      emailVerified: user.emailVerified,
    };
  });

  /**
   * GET /profile/metabox-sso — get SSO redirect URL for linked Metabox account.
   * Returns { ssoUrl } for already-linked users, 409 if not linked.
   */
  fastify.get("/profile/metabox-sso", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { metaboxUserId: true },
    });
    if (!user?.metaboxUserId) {
      return reply.code(409).send({ error: "Metabox account not linked" });
    }
    const metaboxUrl = config.metabox.apiUrl ?? "https://app.meta-box.ru";
    let ssoToken: string;
    if (config.metabox.ssoSecret) {
      ssoToken = issueSsoToken(user.metaboxUserId);
    } else {
      const result = await issueSsoTokenRemote(user.metaboxUserId);
      ssoToken = result.ssoToken;
    }
    return { ssoUrl: `${metaboxUrl}/auth/sso?token=${ssoToken}` };
  });

  /**
   * POST /profile/metabox-register — register a new Metabox account from the bot mini-app.
   * Body: { email, password, firstName? }
   */
  fastify.post("/profile/metabox-register", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { email, password, firstName, lastName, username } = request.body as {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      username?: string;
    };
    if (!email || !password) {
      return reply.code(400).send({ error: "email and password are required" });
    }
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { metaboxUserId: true, referredById: true },
    });
    if (user?.metaboxUserId) {
      return reply.code(409).send({ error: "Metabox account already linked" });
    }
    const { registerFromBot } = await import("../services/metabox-bridge.service.js");
    try {
      const result = await registerFromBot({
        email,
        password,
        telegramId: userId,
        firstName,
        lastName,
        username,
        referrerTelegramId: user?.referredById ?? undefined,
      });
      await db.user.update({
        where: { id: userId },
        data: { metaboxUserId: result.metaboxUserId, metaboxReferralCode: result.referralCode },
      });
      const metaboxUrl = config.metabox.apiUrl ?? "https://app.meta-box.ru";
      return { ssoUrl: `${metaboxUrl}/auth/sso?token=${result.ssoToken}` };
    } catch (err) {
      if (err instanceof MetaboxApiError) {
        return reply.code(err.status).send({ error: err.body, code: err.code });
      }
      throw err;
    }
  });

  /**
   * POST /profile/metabox-login — link existing Metabox account to the bot.
   * Body: { email, password }
   */
  fastify.post("/profile/metabox-login", async (request, reply) => {
    const { userId } = request as AuthRequest;
    const { email, password } = request.body as { email: string; password: string };
    if (!email || !password) {
      return reply.code(400).send({ error: "email and password are required" });
    }
    const { loginAndLink } = await import("../services/metabox-bridge.service.js");
    try {
      const result = await loginAndLink({ email, password, telegramId: userId });
      await db.user.update({
        where: { id: userId },
        data: { metaboxUserId: result.metaboxUserId, metaboxReferralCode: result.referralCode },
      });
      const metaboxUrl = config.metabox.apiUrl ?? "https://app.meta-box.ru";
      return { ssoUrl: `${metaboxUrl}/auth/sso?token=${result.ssoToken}` };
    } catch (err) {
      if (err instanceof MetaboxApiError) {
        return reply.code(err.status).send({ error: err.body, code: err.code });
      }
      throw err;
    }
  });

  /** POST /profile/verify-email — send verification email */
  fastify.post("/profile/verify-email", async (request) => {
    const { userId } = request as AuthRequest;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      throw new Error("No email set");
    }

    if (user.emailVerified) {
      throw new Error("Email already verified");
    }

    // TODO: integrate real email service (SendGrid, AWS SES, etc.)
    // For now, auto-verify for development
    await db.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    return { success: true };
  });
};
