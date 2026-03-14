import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { config } from "@metabox/shared";

/**
 * Admin routes — protected by ADMIN_SECRET header.
 * All routes under /admin require `x-admin-secret: <ADMIN_SECRET>` header.
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", async (request, reply) => {
    const secret = config.api.adminSecret;
    if (!secret) {
      await reply.status(503).send({ error: "Admin access not configured" });
      return;
    }
    const provided = request.headers["x-admin-secret"];
    if (provided !== secret) {
      await reply.status(403).send({ error: "Forbidden" });
    }
  });

  /** GET /admin/users?page=1&limit=50 */
  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    "/admin/users",
    async (request) => {
      const page = Math.max(1, Number(request.query.page ?? 1));
      const limit = Math.min(100, Number(request.query.limit ?? 50));
      const [users, total] = await Promise.all([
        db.user.findMany({
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            username: true,
            firstName: true,
            tokenBalance: true,
            isBlocked: true,
            createdAt: true,
          },
        }),
        db.user.count(),
      ]);
      return {
        users: users.map((u) => ({ ...u, id: u.id.toString() })),
        total,
        page,
        limit,
      };
    },
  );

  /** POST /admin/grant — grant tokens to a user */
  fastify.post<{ Body: { userId: string; amount: number; reason?: string } }>(
    "/admin/grant",
    async (request, reply) => {
      const { userId, amount, reason } = request.body;
      if (!userId || !amount || amount <= 0) {
        await reply.status(400).send({ error: "userId and positive amount required" });
        return;
      }
      const user = await db.user.findUnique({ where: { id: BigInt(userId) } });
      if (!user) {
        await reply.status(404).send({ error: "User not found" });
        return;
      }
      const [updated] = await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { tokenBalance: { increment: amount } },
        }),
        db.tokenTransaction.create({
          data: {
            userId: user.id,
            type: "credit",
            amount,
            reason: reason ?? "admin",
          },
        }),
      ]);
      return { success: true, newBalance: updated.tokenBalance.toString() };
    },
  );

  /** POST /admin/block */
  fastify.post<{ Body: { userId: string; blocked: boolean } }>(
    "/admin/block",
    async (request, reply) => {
      const { userId, blocked } = request.body;
      if (!userId) {
        await reply.status(400).send({ error: "userId required" });
        return;
      }
      const user = await db.user.findUnique({ where: { id: BigInt(userId) } });
      if (!user) {
        await reply.status(404).send({ error: "User not found" });
        return;
      }
      await db.user.update({
        where: { id: user.id },
        data: { isBlocked: blocked },
      });
      return { success: true, isBlocked: blocked };
    },
  );
}
