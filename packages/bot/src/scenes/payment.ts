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

  const planId = payment.invoice_payload;
  try {
    await paymentService.creditPurchase(ctx.user.id, planId);
    await ctx.reply(ctx.t.payments.success);
  } catch (err) {
    logger.error({ err, userId: ctx.user.id.toString(), planId }, "Failed to credit purchase");
    await ctx.reply(ctx.t.payments.error);
  }
}
