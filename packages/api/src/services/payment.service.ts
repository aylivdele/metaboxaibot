import { db } from "../db.js";
import { config, PLANS } from "@metabox/shared";
import { recordSale } from "./metabox-bridge.service.js";

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

  /** Create a Telegram Stars invoice with arbitrary parameters. */
  async createDynamicInvoice(params: {
    title: string;
    description: string;
    payload: string;
    stars: number;
  }): Promise<string> {
    const res = await fetch(`https://api.telegram.org/bot${config.bot.token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        payload: params.payload,
        currency: "XTR",
        prices: [{ label: params.title, amount: params.stars }],
      }),
    });

    const data = (await res.json()) as { ok: boolean; result?: string; description?: string };
    if (!data.ok) throw new Error(data.description ?? "Telegram API error");
    return data.result!;
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
  ): Promise<void> {
    const desc =
      productType === "subscription"
        ? `Подписка ${productName || productId} (${period || "M1"})`
        : `Пакет токенов ${productName || productId}`;

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
