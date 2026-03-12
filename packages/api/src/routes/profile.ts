import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";

type AuthRequest = FastifyRequest & { userId: bigint };

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
};
