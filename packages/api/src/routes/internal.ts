/**
 * Internal routes called by Metabox (server-to-server).
 * Protected by X-Internal-Key header matching METABOX_INTERNAL_KEY env var.
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { db } from "../db.js";
import { config } from "@metabox/shared";
import { expireSubscription, grantMetaboxSubscription } from "../services/payment.service.js";

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
   * Called by Metabox when an AI bot token package or subscription is purchased on the Metabox site.
   * grantType "subscription": credits to subscriptionTokenBalance + sets endDate / planName.
   * grantType "tokens" (default): credits to regular tokenBalance.
   */
  fastify.post("/grant-tokens", async (request, reply) => {
    const { telegramId, tokens, description, grantType, endDate, planName, subscriptionId } =
      request.body as {
        telegramId: string;
        tokens: number;
        description?: string;
        grantType?: "subscription" | "tokens";
        endDate?: string;
        planName?: string;
        /** AiBoxSubscription.id from Metabox — used for idempotency */
        subscriptionId?: string;
      };

    if (!telegramId || typeof tokens !== "number" || tokens === 0) {
      return reply.code(400).send({ error: "telegramId and non-zero tokens are required" });
    }

    const userId = BigInt(telegramId);
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (grantType === "subscription") {
      const resolvedEndDate = endDate ? new Date(endDate) : new Date();
      console.log(
        `[grant-tokens] subscription grant: userId=${userId}, tokens=${tokens}, endDate=${resolvedEndDate.toISOString()}, planName=${planName}, subscriptionId=${subscriptionId}`,
      );
      const granted = await grantMetaboxSubscription({
        userId,
        tokens,
        endDate: resolvedEndDate,
        planName,
        metaboxSubscriptionId: subscriptionId,
        description,
      });
      console.log(
        `[grant-tokens] grantMetaboxSubscription result: ${granted ? "GRANTED" : "ALREADY_GRANTED (skipped)"}`,
      );
      // alreadyGranted (false) is a no-op — idempotent, always return ok
    } else {
      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: tokens } },
        }),
        db.tokenTransaction.create({
          data: {
            userId,
            amount: tokens,
            type: tokens > 0 ? "credit" : "debit",
            reason: "metabox_purchase",
            description: description || null,
          },
        }),
      ]);
    }

    return { ok: true };
  });

  /**
   * POST /internal/sync-subscription
   * Mirrors subscription state from Metabox site to bot.
   * SETS token balances on User + upserts LocalSubscription.
   * No TokenTransaction created. Used when reconnecting site to bot.
   */
  fastify.post("/sync-subscription", async (request, reply) => {
    const {
      telegramId,
      subscriptionTokenBalance,
      tokenBalance,
      // LocalSubscription fields
      endDate,
      planName,
      period,
      startDate,
      tokensGranted,
      metaboxSubscriptionId,
    } = request.body as {
      telegramId: string;
      subscriptionTokenBalance?: number;
      tokenBalance?: number;
      endDate?: string;
      planName?: string;
      period?: string;
      startDate?: string;
      tokensGranted?: number;
      metaboxSubscriptionId?: string;
    };

    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }

    const userId = BigInt(telegramId);
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    // Update User token balances (SET, not increment)
    const userData: Record<string, unknown> = {};
    if (subscriptionTokenBalance !== undefined)
      userData.subscriptionTokenBalance = subscriptionTokenBalance;
    if (tokenBalance !== undefined) userData.tokenBalance = tokenBalance;

    if (Object.keys(userData).length > 0) {
      await db.user.update({ where: { id: userId }, data: userData });
    }

    // Upsert LocalSubscription (single source of truth for subscription state)
    if (endDate) {
      const resolvedEndDate = new Date(endDate);
      await db.localSubscription.upsert({
        where: { userId },
        create: {
          userId,
          planName: planName ?? "Subscription",
          period: period ?? "M1",
          tokensGranted: tokensGranted ?? 0,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: resolvedEndDate,
          isActive: resolvedEndDate > new Date(),
          metaboxSubscriptionId: metaboxSubscriptionId ?? null,
        },
        update: {
          planName: planName ?? "Subscription",
          ...(period ? { period } : {}),
          ...(tokensGranted !== undefined ? { tokensGranted } : {}),
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          endDate: resolvedEndDate,
          isActive: resolvedEndDate > new Date(),
          ...(metaboxSubscriptionId !== undefined ? { metaboxSubscriptionId } : {}),
        },
      });
    }

    console.log(`[sync-subscription] userId=${userId}, user:`, userData, `sub endDate:`, endDate);

    return { ok: true };
  });

  /**
   * POST /internal/unlink-subscription
   * Clears metaboxSubscriptionId on LocalSubscription (used by disconnect "keep in bot").
   */
  fastify.post("/unlink-subscription", async (request, reply) => {
    const { telegramId } = request.body as { telegramId: string };
    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }

    const userId = BigInt(telegramId);
    await db.localSubscription
      .update({
        where: { userId },
        data: { metaboxSubscriptionId: null },
      })
      .catch(() => {
        /* no subscription to unlink — that's ok */
      });

    return { ok: true };
  });

  /**
   * POST /internal/revoke-tokens
   * Called by Metabox when a subscription expires or is revoked on the site.
   * Zeroes subscription balance, clears endDate/planName, deactivates local subscription record.
   * Body: { telegramId: string }
   */
  fastify.post("/revoke-tokens", async (request, reply) => {
    const { telegramId } = request.body as { telegramId: string };

    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }

    const user = await db.user.findUnique({ where: { id: BigInt(telegramId) } });
    if (!user) {
      return { ok: true }; // user not in bot — nothing to revoke
    }

    await expireSubscription(BigInt(telegramId));

    return { ok: true };
  });

  /**
   * POST /internal/reset-token-balance
   * Sets user token balance to exactly 0. Used when admin disconnects TG
   * and transfers all tokens to site. More reliable than decrement.
   * Body: { telegramId: string }
   */
  fastify.post("/reset-token-balance", async (request, reply) => {
    const { telegramId } = request.body as { telegramId: string };
    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }

    const user = await db.user.findUnique({ where: { id: BigInt(telegramId) } });
    if (!user) return { ok: true };

    await db.user.update({
      where: { id: BigInt(telegramId) },
      data: { tokenBalance: 0 },
    });

    return { ok: true, previousBalance: Number(user.tokenBalance) };
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
      select: { tokenBalance: true, subscriptionTokenBalance: true },
    });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    return {
      tokens: Number(user.tokenBalance) + Number(user.subscriptionTokenBalance),
      tokenBalance: Number(user.tokenBalance),
      subscriptionTokenBalance: Number(user.subscriptionTokenBalance),
    };
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

  /**
   * POST /internal/save-subscription
   * Called by Metabox when admin disconnects TG and chooses "keep in bot".
   * Saves subscription data locally so bot can check it independently.
   * Body: { telegramId, planName, period, tokensGranted, endDate, startDate }
   */
  fastify.post("/save-subscription", async (request, reply) => {
    const { telegramId, planName, period, tokensGranted, endDate, startDate } = request.body as {
      telegramId: string;
      planName: string;
      period: string;
      tokensGranted: number;
      endDate: string;
      startDate: string;
    };

    if (!telegramId || !planName || !endDate) {
      return reply.code(400).send({ error: "telegramId, planName, endDate required" });
    }

    const user = await db.user.findUnique({ where: { id: BigInt(telegramId) } });
    if (!user) return { ok: true };

    await db.localSubscription.upsert({
      where: { userId: BigInt(telegramId) },
      create: {
        userId: BigInt(telegramId),
        planName,
        period: period || "M1",
        tokensGranted: tokensGranted || 0,
        endDate: new Date(endDate),
        startDate: new Date(startDate || Date.now()),
        isActive: new Date(endDate) > new Date(),
      },
      update: {
        planName,
        period: period || "M1",
        tokensGranted: tokensGranted || 0,
        endDate: new Date(endDate),
        startDate: new Date(startDate || Date.now()),
        isActive: new Date(endDate) > new Date(),
      },
    });

    return { ok: true };
  });

  /**
   * GET /internal/get-local-subscription?telegramId=<id>
   * Returns local subscription data if exists and active.
   */
  fastify.get<{ Querystring: { telegramId?: string } }>(
    "/get-local-subscription",
    async (request, reply) => {
      const { telegramId } = request.query;
      if (!telegramId) {
        return reply.code(400).send({ error: "telegramId is required" });
      }

      const sub = await db.localSubscription.findUnique({
        where: { userId: BigInt(telegramId) },
      });

      if (!sub || !sub.isActive || new Date(sub.endDate) <= new Date()) {
        return { subscription: null };
      }

      return {
        subscription: {
          planName: sub.planName,
          period: sub.period,
          tokensGranted: sub.tokensGranted,
          endDate: sub.endDate.toISOString(),
          startDate: sub.startDate.toISOString(),
          daysLeft: Math.max(0, Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000)),
          metaboxSubscriptionId: sub.metaboxSubscriptionId ?? undefined,
        },
      };
    },
  );

  /**
   * POST /internal/consume-local-subscription
   * Called by Metabox when bot reconnects to a new site account.
   * Returns and deletes the local subscription data.
   * Body: { telegramId }
   */
  fastify.post("/consume-local-subscription", async (request, reply) => {
    const { telegramId } = request.body as { telegramId: string };
    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId is required" });
    }

    const sub = await db.localSubscription.findUnique({
      where: { userId: BigInt(telegramId) },
    });

    if (!sub || !sub.isActive || new Date(sub.endDate) <= new Date()) {
      return { subscription: null };
    }

    // Delete after consuming
    await db.localSubscription.delete({ where: { id: sub.id } });

    return {
      subscription: {
        planName: sub.planName,
        period: sub.period,
        tokensGranted: sub.tokensGranted,
        endDate: sub.endDate.toISOString(),
        startDate: sub.startDate.toISOString(),
      },
    };
  });
};
