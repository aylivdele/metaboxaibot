import { db } from "../db.js";
import { config } from "@metabox/shared";
import type { AIModel } from "@metabox/shared";

/**
 * Deduct tokens for AI usage.
 * Atomically decrements user balance and records the transaction.
 */
export async function deductTokens(
  userId: bigint,
  amount: number,
  modelId: string,
  dialogId?: string,
): Promise<void> {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: amount } },
    }),
    db.tokenTransaction.create({
      data: {
        userId,
        amount: -amount,
        type: "debit",
        reason: "ai_usage",
        modelId,
        dialogId: dialogId ?? null,
      },
    }),
  ]);
}

/**
 * Throw INSUFFICIENT_TOKENS if the user has no positive balance.
 */
export async function checkBalance(userId: bigint): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (Number(user.tokenBalance) <= 0) throw new Error("INSUFFICIENT_TOKENS");
}

/**
 * Calculate the internal token cost for a request.
 *
 * Formula: (providerUsdCost / usdPerToken) × targetMargin
 *
 * providerUsdCost = model.costUsdPerRequest
 *   + inputTokens  × model.inputCostUsdPerMToken  / 1_000_000
 *   + outputTokens × model.outputCostUsdPerMToken / 1_000_000
 *
 * For media models (image/audio/video): inputTokens and outputTokens are 0,
 * so cost is driven by costUsdPerRequest alone.
 *
 * For LLM models: costUsdPerRequest is 0, cost is driven by per-token pricing.
 */
export function calculateCost(model: AIModel, inputTokens = 0, outputTokens = 0): number {
  const providerUsdCost =
    model.costUsdPerRequest +
    (inputTokens * model.inputCostUsdPerMToken) / 1_000_000 +
    (outputTokens * model.outputCostUsdPerMToken) / 1_000_000;
  return (providerUsdCost / config.billing.usdPerToken) * config.billing.targetMargin;
}
