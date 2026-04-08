import { db } from "../db.js";
import { config, PLANS } from "@metabox/shared";
import { recordSale } from "./metabox-bridge.service.js";
import { checkSubscription } from "./token.service.js";
import { add } from "date-fns";

export interface SaleUserInfo {
  firstName: string;
  lastName?: string;
  username?: string;
  referrerTelegramId?: bigint;
  stars: number;
  starRate: number;
}

export const paymentService = {
  /** Create a Telegram Stars invoice link via Bot API (legacy — from hardcoded PLANS). */
  async createInvoiceLink(planId: string): Promise<string> {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new Error(`Unknown plan: ${planId}`);

    return this.createDynamicInvoice({
      title: `${plan.label} — ${plan.tokens} tokens`,
      description: `${plan.tokens} AI tokens for use in Metabox`,
      payload: plan.id,
      stars: plan.stars,
    });
  },

  /** Send a Telegram Stars invoice directly to user's chat via sendInvoice. */
  async sendInvoiceToChat(
    chatId: bigint,
    params: { title: string; description: string; payload: string; stars: number },
  ): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${config.bot.token}/sendInvoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        title: params.title,
        description: params.description,
        payload: params.payload,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: params.title, amount: params.stars }],
      }),
    });

    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) throw new Error(data.description ?? "sendInvoice failed");
  },

  /** Create a Telegram Stars invoice with arbitrary parameters. */
  async createDynamicInvoice(params: {
    title: string;
    description: string;
    payload: string;
    stars: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`https://api.telegram.org/bot${config.bot.token}/createInvoiceLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: params.title,
          description: params.description,
          payload: params.payload,
          provider_token: "",
          currency: "XTR",
          prices: [{ label: params.title, amount: params.stars }],
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as { ok: boolean; result?: string; description?: string };
      if (!data.ok) throw new Error(data.description ?? "Telegram API error");
      return data.result!;
    } finally {
      clearTimeout(timeout);
    }
  },

  /** Credit tokens to user after successful Stars payment (legacy hardcoded plans). */
  async creditPurchase(userId: bigint, planId: string, userInfo: SaleUserInfo): Promise<void> {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new Error(`Unknown plan: ${planId}`);

    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: plan.tokens } },
      }),
      db.tokenTransaction.create({
        data: {
          userId,
          amount: plan.tokens,
          type: "credit",
          reason: "purchase",
          description: `Пакет токенов ${plan.label}`,
          modelId: plan.id,
        },
      }),
    ]);

    // Notify Metabox for MLM bonus + order tracking (always, even for unlinked users)
    recordSale({
      telegramId: userId,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      username: userInfo.username,
      productType: "product",
      productId: plan.id,
      tokens: plan.tokens,
      priceRub: plan.priceRub,
      stars: userInfo.stars,
      starRate: userInfo.starRate,
      referrerTelegramId: userInfo.referrerTelegramId,
    })
      .then((res) => {
        console.log("[payment] recordSale ok:", {
          userId: res.userId,
          orderId: res.orderId,
          tgUser: userId.toString(),
        });
      })
      .catch((err: unknown) => {
        console.error("[payment] recordSale error:", err);
      });
  },

  /** Credit tokens for a dynamic product purchase (from Metabox catalog). */
  async creditDynamicPurchase(
    userId: bigint,
    tokens: number,
    productId: string,
    priceRub: number,
    productType: "product" | "subscription",
    period: string | undefined,
    userInfo: SaleUserInfo,
    productName?: string,
    endDateOverride?: Date,
  ): Promise<void> {
    const periodStr = period || "M1";
    const months = parseInt(periodStr.substring(1), 10);
    const startDate = new Date();
    const desc =
      productType === "subscription"
        ? `Подписка ${productName || productId} (${periodStr})`
        : `Пакет токенов ${productName || productId}`;

    if (productType === "subscription") {
      // Extend from current endDate if subscription is still active, otherwise from now
      const currentUser = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { subscriptionEndDate: true },
      });
      const baseDate =
        currentUser.subscriptionEndDate && currentUser.subscriptionEndDate > startDate
          ? currentUser.subscriptionEndDate
          : startDate;
      const endDate = endDateOverride ?? add(baseDate, { months });

      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: {
            subscriptionTokenBalance: { increment: tokens },
            subscriptionEndDate: endDate,
            subscriptionPlanName: productName ?? productId,
          },
        }),
        db.tokenTransaction.create({
          data: {
            userId,
            amount: tokens,
            type: "credit",
            reason: "purchase",
            description: desc,
            modelId: productId,
          },
        }),
      ]);
      // Upsert LocalSubscription (bot-native purchase — no metaboxSubscriptionId)
      await db.localSubscription.upsert({
        where: { userId },
        create: {
          userId,
          planName: productName ?? desc,
          period: period || "undefined",
          tokensGranted: tokens,
          startDate,
          endDate,
          isActive: true,
        },
        update: {
          planName: productName ?? desc,
          period: period || "undefined",
          tokensGranted: tokens,
          startDate,
          endDate,
          isActive: true,
          metaboxSubscriptionId: null,
        },
      });
    } else {
      // Token package — requires active subscription
      await checkSubscription(userId);

      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: tokens } },
        }),
        db.tokenTransaction.create({
          data: {
            userId,
            amount: tokens,
            type: "credit",
            reason: "purchase",
            description: desc,
            modelId: productId,
          },
        }),
      ]);
    }

    // Notify Metabox for MLM bonus + order tracking (always, even for unlinked users)
    recordSale({
      telegramId: userId,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      username: userInfo.username,
      productType,
      productId,
      period: period as "M1" | "M3" | "M6" | "M12" | undefined,
      tokens,
      priceRub,
      stars: userInfo.stars,
      starRate: userInfo.starRate,
      referrerTelegramId: userInfo.referrerTelegramId,
    })
      .then((res) => {
        console.log("[payment] recordSale ok:", {
          userId: res.userId,
          orderId: res.orderId,
          tgUser: userId.toString(),
        });
      })
      .catch((err: unknown) => {
        console.error("[payment] recordSale error:", err);
      });
  },
};

/**
 * Grant subscription tokens from a Metabox-side purchase, with idempotency.
 *
 * If `metaboxSubscriptionId` is provided and a LocalSubscription with that ID already
 * exists, the grant is skipped (returns false). Otherwise tokens are credited and a
 * LocalSubscription record is upserted with the Metabox subscription ID so that any
 * future duplicate calls are no-ops.
 *
 * Returns true if tokens were granted, false if already granted.
 */
export async function grantMetaboxSubscription(params: {
  userId: bigint;
  tokens: number;
  endDate: Date;
  planName?: string;
  metaboxSubscriptionId?: string;
  description?: string;
}): Promise<boolean> {
  const { userId, tokens, endDate, planName, metaboxSubscriptionId, description } = params;

  // Idempotency: skip if this specific Metabox subscription was already granted
  if (metaboxSubscriptionId) {
    const existing = await db.localSubscription.findUnique({
      where: { metaboxSubscriptionId },
    });
    if (existing) {
      console.log(
        `[grantMetaboxSubscription] Idempotency skip: metaboxSubscriptionId=${metaboxSubscriptionId} already exists`,
      );
      return false;
    }
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { subscriptionEndDate: true },
  });

  // Extend from current active endDate, otherwise use provided endDate
  const resolvedEndDate =
    user.subscriptionEndDate && user.subscriptionEndDate > endDate
      ? user.subscriptionEndDate
      : endDate;

  console.log(
    `[grantMetaboxSubscription] userId=${userId}, tokens=${tokens}, endDate=${endDate.toISOString()}, resolvedEndDate=${resolvedEndDate.toISOString()}, planName=${planName}, currentSubEndDate=${user.subscriptionEndDate?.toISOString() ?? "null"}`,
  );

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        subscriptionTokenBalance: { increment: tokens },
        subscriptionEndDate: resolvedEndDate,
        ...(planName ? { subscriptionPlanName: planName } : {}),
      },
    }),
    db.tokenTransaction.create({
      data: {
        userId,
        amount: tokens,
        type: "credit",
        reason: "metabox_purchase",
        description: description ?? null,
      },
    }),
  ]);

  // Verify the update
  const updated = await db.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionEndDate: true,
      subscriptionTokenBalance: true,
      subscriptionPlanName: true,
    },
  });
  console.log(
    `[grantMetaboxSubscription] ✅ After update: subscriptionEndDate=${updated?.subscriptionEndDate?.toISOString()}, subscriptionTokenBalance=${updated?.subscriptionTokenBalance}, subscriptionPlanName=${updated?.subscriptionPlanName}`,
  );

  // Upsert LocalSubscription — serves as the idempotency record for future calls
  await db.localSubscription.upsert({
    where: { userId },
    create: {
      userId,
      planName: planName ?? "Subscription",
      period: "M1",
      tokensGranted: tokens,
      startDate: new Date(),
      endDate: resolvedEndDate,
      isActive: true,
      metaboxSubscriptionId: metaboxSubscriptionId ?? null,
    },
    update: {
      planName: planName ?? "Subscription",
      tokensGranted: tokens,
      endDate: resolvedEndDate,
      isActive: true,
      metaboxSubscriptionId: metaboxSubscriptionId ?? null,
    },
  });

  return true;
}

/**
 * Zero out subscription balance and clear subscription fields when a subscription expires.
 */
export async function expireSubscription(userId: bigint): Promise<void> {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        subscriptionTokenBalance: 0,
        subscriptionEndDate: null,
        subscriptionPlanName: null,
      },
    }),
    db.localSubscription.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    }),
  ]);
}
