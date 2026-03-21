import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { createHash, randomBytes } from "crypto";

type AuthRequest = FastifyRequest & { userId: bigint };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return `${salt}:${hash}`;
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
  fastify.patch("/profile/settings", async (request) => {
    const { userId } = request as AuthRequest;
    const body = request.body as { email?: string; password?: string };

    const data: Record<string, unknown> = {};

    if (body.email !== undefined) {
      data.email = body.email;
      data.emailVerified = false;
    }

    if (body.password) {
      if (body.password.length < 6) {
        throw new Error("Password must be at least 6 characters");
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
