import type { BotContext } from "../types/context.js";
import { paymentService, getRate, STAR_PRICE_USD } from "@metabox/api/services";
import type { SaleUserInfo } from "@metabox/api/services";
import { logger } from "../logger.js";

/** Answer Telegram's pre-checkout query — must respond within 10 seconds. */
export async function handlePreCheckoutQuery(ctx: BotContext): Promise<void> {
  await ctx.answerPreCheckoutQuery(true);
}

/** Credit tokens after Stars payment is confirmed. */
export async function handleSuccessfulPayment(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const payment = ctx.message?.successful_payment;
  if (!payment) return;

  const payload = payment.invoice_payload;

  try {
    // Compute star rate: 1 star = usdtRubRate × STAR_PRICE_USD (in RUB)
    const usdtRubRate = await getRate();
    const stars = payment.total_amount; // actual Stars charged by Telegram
    const starRate = usdtRubRate * STAR_PRICE_USD;

    // Build user info from Telegram context
    const userInfo: SaleUserInfo = {
      firstName: ctx.from?.first_name ?? "Unknown",
      lastName: ctx.from?.last_name,
      username: ctx.from?.username,
      referrerTelegramId: ctx.user.referredById ?? undefined,
      stars,
      starRate,
    };

    // New format: "product:{id}:{tokens}:{priceRub}" or "subscription:{planId}:{period}:{tokens}:{priceRub}"
    if (payload.startsWith("product:") || payload.startsWith("subscription:")) {
      const parts = payload.split(":");
      const isSubscription = payload.startsWith("subscription:");
      const productId = parts[1];
      const tokens = Number(parts[isSubscription ? 3 : 2]);
      const priceRub = Number(parts[isSubscription ? 4 : 3]);
      const productType = isSubscription ? "subscription" : "product";
      const period = isSubscription ? parts[2] : undefined;

      await paymentService.creditDynamicPurchase(
        ctx.user.id,
        tokens,
        productId,
        priceRub,
        productType,
        period,
        userInfo,
      );
    } else {
      // Legacy format: planId directly
      await paymentService.creditPurchase(ctx.user.id, payload, userInfo);
    }

    await ctx.reply(ctx.t.payments.success);
  } catch (err) {
    logger.error({ err, userId: ctx.user.id.toString(), payload }, "Failed to credit purchase");
    await ctx.reply(ctx.t.payments.error);
  }
}
