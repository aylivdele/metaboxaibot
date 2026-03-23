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
   * POST /internal/link-metabox
   * Called by Metabox after a user links their Telegram via deep link.
   * Updates AI Box user.metaboxUserId.
   */
  fastify.post("/internal/link-metabox", async (request, reply) => {
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
  fastify.post("/internal/grant-tokens", async (request, reply) => {
    const { telegramId, tokens } = request.body as {
      telegramId: string;
      tokens: number;
    };

    if (!telegramId || typeof tokens !== "number" || tokens <= 0) {
      return reply.code(400).send({ error: "telegramId and positive tokens are required" });
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
          type: "credit",
          reason: "metabox_purchase",
        },
      }),
    ]);

    return { ok: true };
  });

  /**
   * GET /internal/check-bot-user?telegramId=<id>
   * Called by Metabox to check whether a user has ever started the AI Box bot.
   * Returns { activated: true } if the user exists in the bot DB, { activated: false } otherwise.
   */
  fastify.get<{ Querystring: { telegramId?: string } }>(
    "/internal/check-bot-user",
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
