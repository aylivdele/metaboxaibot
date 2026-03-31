import { db } from "../db.js";
import { config } from "@metabox/shared";
import type { AIModel } from "@metabox/shared";

/**
 * Deduct tokens for AI usage. Subscription tokens are spent first, then regular tokens.
 * Atomically updates balances and records the transaction.
 */
export async function deductTokens(
  userId: bigint,
  amount: number,
  modelId: string,
  dialogId?: string,
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { subscriptionTokenBalance: true, tokenBalance: true },
  });

  // Regular (purchased) tokens are spent first, then subscription tokens.
  // This way, when subscription expires, only unused subscription tokens are lost.
  const fromRegular = Math.min(Number(user.tokenBalance), amount);
  const fromSub = amount - fromRegular;

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        ...(fromSub > 0 ? { subscriptionTokenBalance: { decrement: fromSub } } : {}),
        ...(fromRegular > 0 ? { tokenBalance: { decrement: fromRegular } } : {}),
      },
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
 * Throw NO_SUBSCRIPTION if the user has no active subscription,
 * or INSUFFICIENT_TOKENS if combined balance is below required amount.
 */
export async function checkBalance(userId: bigint, required: number): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      tokenBalance: true,
      subscriptionTokenBalance: true,
      subscriptionEndDate: true,
      role: true,
    },
  });
  if (user.role === "ADMIN") {
    return;
  }
  const hasActiveSub = user.subscriptionEndDate && user.subscriptionEndDate > new Date();
  if (!hasActiveSub) throw new Error("NO_SUBSCRIPTION");
  const total = Number(user.subscriptionTokenBalance) + Number(user.tokenBalance);
  if (total < required) throw new Error("INSUFFICIENT_TOKENS");
}

/**
 * Throw NO_SUBSCRIPTION if the user has no active subscription.
 * Used in payment flow to gate token package purchases.
 */
export async function checkSubscription(userId: bigint): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { subscriptionEndDate: true, role: true },
  });
  if (user.role === "ADMIN") {
    return;
  }
  if (!user.subscriptionEndDate || user.subscriptionEndDate <= new Date()) {
    throw new Error("NO_SUBSCRIPTION");
  }
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
 * For per-megapixel models (costUsdPerMPixel set): costUsdPerRequest must be 0
 * and providerUsdCost = ceil(megapixels) × costUsdPerMPixel.
 * megapixels = width × height / 1_000_000, ceiled to the nearest whole megapixel.
 *
 * For per-video-token models (costUsdPerMVideoToken set): costUsdPerRequest must be 0
 * and providerUsdCost = videoTokens / 1_000_000 × costUsdPerMVideoToken.
 * videoTokens = (width × height × fps × duration) / 1024
 *
 * For media models (image/audio/video): inputTokens and outputTokens are 0,
 * so cost is driven by costUsdPerRequest, costUsdPerMPixel, or costUsdPerMVideoToken alone.
 *
 * For LLM models: costUsdPerRequest is 0, cost is driven by per-token pricing.
 */
export function calculateCost(
  model: AIModel,
  inputTokens = 0,
  outputTokens = 0,
  megapixels?: number,
  videoTokens?: number,
  modelSettings?: Record<string, unknown>,
  durationSeconds?: number,
  charCount?: number,
): number {
  // Multi-dimensional pricing table (e.g. resolution × duration for MiniMax).
  // When all dimension values are present in modelSettings, look up the exact cost.
  if (model.costMatrix && modelSettings) {
    const key = model.costMatrix.dims.map((dim) => String(modelSettings[dim] ?? "")).join("__");
    const matrixCost = model.costMatrix.table[key];
    if (matrixCost !== undefined) {
      return (matrixCost / config.billing.usdPerToken) * config.billing.targetMargin;
    }
  }

  // Apply context-size-based pricing tiers (e.g. GPT-5.4 doubles input rate above 272k tokens)
  let inputCostPerMToken = model.inputCostUsdPerMToken;
  if (model.contextPricingTiers && inputTokens > model.contextPricingTiers.thresholdTokens) {
    inputCostPerMToken *= model.contextPricingTiers.inputMultiplier;
  }

  // Resolve cost overrides from costVariants based on user's current settings
  let baseRequest = model.costUsdPerRequest;
  let outputCostPerMToken = model.outputCostUsdPerMToken;
  if (model.contextPricingTiers && inputTokens > model.contextPricingTiers.thresholdTokens) {
    outputCostPerMToken *= model.contextPricingTiers.outputMultiplier;
  }
  let costPerSecond = model.costUsdPerSecond;
  let costPerMVideoToken = model.costUsdPerMVideoToken;
  let costPerKChar = model.costUsdPerKChar;

  if (model.costVariants && modelSettings) {
    const settingVal = modelSettings[model.costVariants.settingKey];
    const variant = model.costVariants.map[String(settingVal)];
    if (typeof variant === "number") {
      baseRequest = variant;
    } else if (variant) {
      if (variant.costUsdPerRequest !== undefined) baseRequest = variant.costUsdPerRequest;
      if (variant.outputCostUsdPerMToken !== undefined)
        outputCostPerMToken = variant.outputCostUsdPerMToken;
      if (variant.costUsdPerSecond !== undefined) costPerSecond = variant.costUsdPerSecond;
      if (variant.costUsdPerMVideoToken !== undefined)
        costPerMVideoToken = variant.costUsdPerMVideoToken;
      if (variant.costUsdPerKChar !== undefined) costPerKChar = variant.costUsdPerKChar;
    }
  }

  // For audio SFX: if costUsdPerSecond is set but no explicit durationSeconds,
  // extract it from modelSettings.duration_seconds (null → AI mode → fall back to baseRequest).
  const effectiveDuration =
    durationSeconds ??
    (costPerSecond !== undefined && typeof modelSettings?.duration_seconds === "number"
      ? modelSettings.duration_seconds
      : undefined);

  const perRequestCost =
    costPerMVideoToken && videoTokens
      ? (videoTokens / 1_000_000) * costPerMVideoToken
      : model.costUsdPerMPixel && megapixels
        ? (model.costUsdPerMPixelBase ?? 0) + Math.ceil(megapixels) * model.costUsdPerMPixel
        : costPerSecond !== undefined && effectiveDuration !== undefined
          ? costPerSecond * effectiveDuration
          : costPerKChar !== undefined && charCount !== undefined
            ? (charCount / 1000) * costPerKChar
            : baseRequest;

  // Apply additive cost components (e.g. web search +$0.015, high thinking +$0.002)
  let addonCost = 0;
  if (model.costAddons && modelSettings) {
    for (const addon of model.costAddons) {
      const val = String(modelSettings[addon.settingKey] ?? "");
      addonCost += addon.map[val] ?? 0;
    }
  }

  const providerUsdCost =
    perRequestCost +
    addonCost +
    (inputTokens * inputCostPerMToken) / 1_000_000 +
    (outputTokens * outputCostPerMToken) / 1_000_000;
  return usdToTokens(providerUsdCost);
}

/** Convert a USD cost to internal tokens using the billing config. */
export function usdToTokens(usd: number): number {
  return (usd / config.billing.usdPerToken) * config.billing.targetMargin;
}

/**
 * Compute video tokens for per-video-token billing models (e.g. Seedance).
 * videoTokens = (width × height × fps × duration) / 1024
 *
 * Prefer actual dimensions (parsed from the generated MP4) over aspect-ratio estimates.
 */
export function computeVideoTokens(
  model: AIModel,
  aspectRatio: string | undefined,
  duration: number,
  actualWidth?: number,
  actualHeight?: number,
): number {
  if (!model.videoFps) return 0;

  let w: number;
  let h: number;

  if (actualWidth && actualHeight) {
    w = actualWidth;
    h = actualHeight;
  } else {
    // Fallback: estimate from aspect ratio at the model's default resolution
    const RESOLUTION: Record<string, [number, number]> = {
      "16:9": [1280, 720],
      "9:16": [720, 1280],
      "1:1": [720, 720],
      "4:3": [960, 720],
      "3:4": [720, 960],
    };
    [w, h] = RESOLUTION[aspectRatio ?? "16:9"] ?? [1280, 720];
  }

  return (w * h * (model.videoFps ?? 30) * duration) / 1024;
}
