import type { BotContext } from "../types/context.js";
import { paymentService } from "@metabox/api/services";
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
    // New format: "product:{id}:{tokens}:{priceRub}" or "subscription:{planId}:{period}:{tokens}:{priceRub}"
    if (payload.startsWith("product:") || payload.startsWith("subscription:")) {
      const parts = payload.split(":");
      const tokens = Number(parts[payload.startsWith("product:") ? 2 : 3]);
      const priceRub = Number(parts[payload.startsWith("product:") ? 3 : 4]);
      const productId = parts[1];

      await paymentService.creditDynamicPurchase(ctx.user.id, tokens, productId, priceRub);
    } else {
      // Legacy format: planId directly
      await paymentService.creditPurchase(ctx.user.id, payload);
    }

    await ctx.reply(ctx.t.payments.success);
  } catch (err) {
    logger.error({ err, userId: ctx.user.id.toString(), payload }, "Failed to credit purchase");
    await ctx.reply(ctx.t.payments.error);
  }
}
