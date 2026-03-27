/**
 * Internal routes called by Metabox (server-to-server).
 * Protected by X-Internal-Key header matching METABOX_INTERNAL_KEY env var.
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { db } from "../db.js";
import { config } from "@metabox/shared";

function checkKey(request: FastifyRequest): boolean {
  const key = config.metabox.internalKey;
  return !!key && request.headers["x-internal-key"] === key;
}

export const internalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    if (!checkKey(request)) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
  });

  /**
   * POST /link-metabox
   * Called by Metabox after a user links their Telegram via deep link.
   * Updates AI Box user.metaboxUserId.
   */
  fastify.post("/link-metabox", async (request, reply) => {
    const { telegramId, metaboxUserId } = request.body as {
      telegramId: string;
      metaboxUserId: string;
    };

    if (!telegramId || !metaboxUserId) {
      return reply.code(400).send({ error: "telegramId and metaboxUserId are required" });
    }

    await db.user.update({
      where: { id: BigInt(telegramId) },
      data: { metaboxUserId },
    });

    return { ok: true };
  });

  /**
   * POST /internal/grant-tokens
   * Called by Metabox when an AI bot token package is purchased on the Metabox site.
   * Credits tokens to the user's AI Box balance.
   */
  fastify.post("/grant-tokens", async (request, reply) => {
    const { telegramId, tokens, description } = request.body as {
      telegramId: string;
      tokens: number;
      description?: string;
    };

    if (!telegramId || typeof tokens !== "number" || tokens === 0) {
      return reply.code(400).send({ error: "telegramId and non-zero tokens are required" });
    }

    const user = await db.user.findUnique({ where: { id: BigInt(telegramId) } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    await db.$transaction([
      db.user.update({
        where: { id: BigInt(telegramId) },
        data: { tokenBalance: { increment: tokens } },
      }),
      db.tokenTransaction.create({
        data: {
          userId: BigInt(telegramId),
          amount: tokens,
          type: tokens > 0 ? "credit" : "debit",
          reason: "metabox_purchase",
          description: description || null,
        },
      }),
    ]);

    return { ok: true };
  });

  /**
   * POST /internal/revoke-tokens
   * Called by Metabox when rolling back a token package or subscription purchase.
   * Deducts tokens from user balance and deletes the matching credit transaction.
   * Body: { telegramId: string, tokens: number }
   */
  fastify.post("/revoke-tokens", async (request, reply) => {
    const { telegramId, tokens } = request.body as {
      telegramId: string;
      tokens: number;
    };

    if (!telegramId || typeof tokens !== "number" || tokens <= 0) {
      return reply.code(400).send({ error: "telegramId and positive tokens are required" });
    }

    const user = await db.user.findUnique({ where: { id: BigInt(telegramId) } });
    if (!user) {
      return { ok: true }; // user not in bot — nothing to revoke
    }

    // Find the most recent matching credit transaction to delete
    const txToDelete = await db.tokenTransaction.findFirst({
      where: {
        userId: BigInt(telegramId),
        type: "credit",
        amount: { gte: tokens - 0.01, lte: tokens + 0.01 },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const ops: any[] = [
      db.user.update({
        where: { id: BigInt(telegramId) },
        data: { tokenBalance: { decrement: tokens } },
      }),
    ];

    if (txToDelete) {
      ops.push(db.tokenTransaction.delete({ where: { id: txToDelete.id } }));
    }

    await db.$transaction(ops);

    return { ok: true };
  });

  /**
   * POST /internal/unlink-metabox
   * Called by Metabox admin when an admin disconnects a user's Telegram account.
   * Clears metaboxUserId and metaboxReferralCode from the AI Box user record.
   */
  fastify.post("/unlink-metabox", async (request, reply) => {
    const { telegramId } = request.body as { telegramId: string };

    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }

    const user = await db.user.findUnique({
      where: { id: BigInt(telegramId) },
      select: { id: true },
    });

    if (!user) {
      return { ok: true }; // user never started the bot — nothing to unlink
    }

    await db.user.update({
      where: { id: BigInt(telegramId) },
      data: { metaboxUserId: null, metaboxReferralCode: null },
    });

    return { ok: true };
  });

  /**
   * GET /internal/user-balance?telegramId=<id>
   * Called by Metabox to get the current token balance of a bot user.
   * Returns { tokens: number } or 404 if user not found.
   */
  fastify.get<{ Querystring: { telegramId?: string } }>("/user-balance", async (request, reply) => {
    const { telegramId } = request.query;
    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }
    const user = await db.user.findUnique({
      where: { id: BigInt(telegramId) },
      select: { tokenBalance: true },
    });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    return { tokens: Number(user.tokenBalance) };
  });

  /**
   * GET /internal/check-bot-user?telegramId=<id>
   * Called by Metabox to check whether a user has ever started the AI Box bot.
   * Returns { activated: true } if the user exists in the bot DB, { activated: false } otherwise.
   */
  fastify.get<{ Querystring: { telegramId?: string } }>(
    "/check-bot-user",
    async (request, reply) => {
      const { telegramId } = request.query;
      if (!telegramId) {
        return reply.code(400).send({ error: "telegramId is required" });
      }
      const user = await db.user.findUnique({
        where: { id: BigInt(telegramId) },
        select: { id: true },
      });
      return { activated: !!user };
    },
  );
};

