import { db } from "../db.js";
import { config, PLANS } from "@metabox/shared";
import { recordSale } from "./metabox-bridge.service.js";

export const paymentService = {
  /** Create a Telegram Stars invoice link via Bot API. */
  async createInvoiceLink(planId: string): Promise<string> {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new Error(`Unknown plan: ${planId}`);

    const res = await fetch(`https://api.telegram.org/bot${config.bot.token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${plan.label} — ${plan.tokens} tokens`,
        description: `${plan.tokens} AI tokens for use in Metabox`,
        payload: plan.id,
        currency: "XTR",
        prices: [{ label: `${plan.tokens} AI tokens`, amount: plan.stars }],
      }),
    });

    const data = (await res.json()) as { ok: boolean; result?: string; description?: string };
    if (!data.ok) throw new Error(data.description ?? "Telegram API error");
    return data.result!;
  },

  /** Credit tokens to user after successful Stars payment. */
  async creditPurchase(userId: bigint, planId: string): Promise<void> {
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
          modelId: plan.id,
        },
      }),
    ]);

    // Notify Metabox for MLM bonus calculation (non-fatal: user is linked only if metaboxUserId is set)
    const user = await db.user.findUnique({ where: { id: userId }, select: { metaboxUserId: true } });
    if (user?.metaboxUserId) {
      recordSale({
        telegramId: userId,
        tokens: plan.tokens,
        priceRub: plan.priceRub,
        marginRub: plan.marginRub,
      }).catch((err: unknown) => {
        // Non-fatal: log but don't fail the payment
        console.error("[payment] recordSale error:", err);
      });
    }
  },
};
