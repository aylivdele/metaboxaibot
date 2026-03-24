import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import {
  issueSsoToken,
  issueSsoTokenRemote,
  MetaboxApiError,
} from "../services/metabox-bridge.service.js";
import { config } from "@metabox/shared";

type AuthRequest = FastifyRequest & {
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
};

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
    const { userId, user } = request as AuthRequest;
    const { email, password } = request.body as { email: string; password: string };
    if (!email || !password) {
      return reply.code(400).send({ error: "email and password are required" });
    }
    const { loginAndLink } = await import("../services/metabox-bridge.service.js");
    try {
      const botPurchase = await db.tokenTransaction.findFirst({
        where: { userId, type: "credit", reason: "purchase" },
        select: { id: true },
      });
      const result = await loginAndLink({
        email,
        password,
        telegramId: userId,
        telegramUsername: user.username,
        referrerTelegramId: user.referredById,
        botHasPurchase: !!botPurchase,
        botCreatedAt: user.createdAt,
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
};
