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
 * Throw INSUFFICIENT_TOKENS if the user's balance is below the required amount.
 */
export async function checkBalance(userId: bigint, required: number): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (Number(user.tokenBalance) < required) throw new Error("INSUFFICIENT_TOKENS");
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
  // Resolve cost overrides from costVariants based on user's current settings
  let baseRequest = model.costUsdPerRequest;
  let outputCostPerMToken = model.outputCostUsdPerMToken;
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
        ? Math.ceil(megapixels) * model.costUsdPerMPixel
        : costPerSecond !== undefined && effectiveDuration !== undefined
          ? costPerSecond * effectiveDuration
          : costPerKChar !== undefined && charCount !== undefined
            ? (charCount / 1000) * costPerKChar
            : baseRequest;
  const providerUsdCost =
    perRequestCost +
    (inputTokens * model.inputCostUsdPerMToken) / 1_000_000 +
    (outputTokens * outputCostPerMToken) / 1_000_000;
  return (providerUsdCost / config.billing.usdPerToken) * config.billing.targetMargin;
}

/**
 * Compute video tokens for per-video-token billing models (e.g. Seedance).
 * videoTokens = (width × height × fps × duration) / 1024
 *
 * Resolution is derived from the aspect ratio using the model's typical output resolution.
 */
export function computeVideoTokens(
  model: AIModel,
  aspectRatio: string | undefined,
  duration: number,
): number {
  if (!model.videoFps) return 0;

  // Typical output resolution per aspect ratio for video-token models
  const RESOLUTION: Record<string, [number, number]> = {
    "16:9": [1280, 720],
    "9:16": [720, 1280],
    "1:1": [720, 720],
    "4:3": [960, 720],
    "3:4": [720, 960],
  };

  const [w, h] = RESOLUTION[aspectRatio ?? "16:9"] ?? [1280, 720];
  return (w * h * (model.videoFps ?? 30) * duration) / 1024;
}
