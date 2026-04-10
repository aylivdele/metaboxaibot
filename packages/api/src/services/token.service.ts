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
  reason?: string,
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { subscriptionTokenBalance: true, tokenBalance: true },
  });

  // Subscription tokens are spent first, then regular (purchased) tokens.
  const fromSub = Math.min(Number(user.subscriptionTokenBalance), amount);
  const fromRegular = amount - fromSub;

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
        reason: reason ?? "ai_usage",
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
      role: true,
    },
  });
  if (user.role === "ADMIN") {
    return;
  }
  // Check active subscription from LocalSubscription (single source of truth)
  const sub = await db.localSubscription.findUnique({ where: { userId } });
  const hasActiveSub = sub && sub.isActive && sub.endDate > new Date();
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
    select: { role: true },
  });
  if (user.role === "ADMIN") {
    return;
  }
  const sub = await db.localSubscription.findUnique({ where: { userId } });
  if (!sub || !sub.isActive || sub.endDate <= new Date()) {
    throw new Error("NO_SUBSCRIPTION");
  }
}

// ─── Internal billing helpers ─────────────────────────────────────────────────

interface ResolvedRates {
  baseRequest: number;
  inputCostPerMToken: number;
  outputCostPerMToken: number;
  costPerSecond?: number;
  costPerMVideoToken?: number;
  costPerKChar?: number;
}

/**
 * Apply costVariants (setting-based overrides) and contextPricingTiers (token-count
 * multipliers) to produce a snapshot of resolved rates for this request.
 */
function resolveRates(
  model: AIModel,
  inputTokens: number,
  modelSettings: Record<string, unknown> | undefined,
): ResolvedRates {
  let baseRequest = model.costUsdPerRequest;
  let inputCostPerMToken = model.inputCostUsdPerMToken;
  let outputCostPerMToken = model.outputCostUsdPerMToken;
  let costPerSecond = model.costUsdPerSecond;
  let costPerMVideoToken = model.costUsdPerMVideoToken;
  let costPerKChar = model.costUsdPerKChar;

  // Context-size pricing tiers (e.g. GPT-5.4 doubles rates above 272k tokens)
  if (model.contextPricingTiers && inputTokens > model.contextPricingTiers.thresholdTokens) {
    inputCostPerMToken *= model.contextPricingTiers.inputMultiplier;
    outputCostPerMToken *= model.contextPricingTiers.outputMultiplier;
  }

  // Setting-based cost overrides
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

  return {
    baseRequest,
    inputCostPerMToken,
    outputCostPerMToken,
    costPerSecond,
    costPerMVideoToken,
    costPerKChar,
  };
}

interface MediaOpts {
  megapixels?: number;
  /**
   * Megapixels of the input image (img2img models). Used to add an
   * input-image surcharge via `costUsdPerMPixelInput`. Ignored when the
   * model has `costUsdPerMPixelInputFixed === true` (flat fee).
   */
  inputMegapixels?: number;
  /** True when an input image is present. Needed for flat-fee input billing. */
  hasInputImage?: boolean;
  videoTokens?: number;
  durationSeconds?: number;
  charCount?: number;
  modelSettings?: Record<string, unknown>;
}

/**
 * Compute the base provider USD cost for media models (image / audio / video).
 * Billing mode priority:
 *   1. costMatrix  — exact lookup by setting values (returns immediately)
 *   2. per-megapixel
 *   3. per-video-token
 *   4. per-second  (includes baseRequest flat fee)
 *   5. per-kchar   (includes baseRequest flat fee)
 *   6. fallback    — baseRequest
 */
function computeMediaBaseUsd(model: AIModel, rates: ResolvedRates, opts: MediaOpts): number {
  const { megapixels, videoTokens, charCount, modelSettings } = opts;

  // Resolve effective duration (explicit arg → modelSettings → undefined)
  const durationSeconds =
    opts.durationSeconds ??
    (rates.costPerSecond !== undefined && typeof modelSettings?.duration_seconds === "number"
      ? modelSettings.duration_seconds
      : undefined);

  // 1. Multi-dimensional pricing table
  if (model.costMatrix && modelSettings) {
    const key = model.costMatrix.dims.map((dim) => String(modelSettings[dim] ?? "")).join("__");
    const matrixCost = model.costMatrix.table[key];
    if (matrixCost !== undefined) return matrixCost;
  }

  // 2. Per-megapixel
  if (model.costUsdPerMPixel && megapixels) {
    let cost = (model.costUsdPerMPixelBase ?? 0) + Math.ceil(megapixels) * model.costUsdPerMPixel;
    // Optional image-to-image input surcharge
    if (model.costUsdPerMPixelInput && opts.hasInputImage) {
      if (model.costUsdPerMPixelInputFixed) {
        // Flat fee regardless of input size (provider normalizes input to 1 MP).
        cost += model.costUsdPerMPixelInput;
      } else if (opts.inputMegapixels !== undefined && opts.inputMegapixels > 0) {
        cost += Math.ceil(opts.inputMegapixels) * model.costUsdPerMPixelInput;
      }
    }
    return cost;
  }

  // 3. Per-video-token
  if (rates.costPerMVideoToken && videoTokens) {
    return (videoTokens / 1_000_000) * rates.costPerMVideoToken;
  }

  // 4. Per-second (flat fee + duration charge)
  if (rates.costPerSecond !== undefined && durationSeconds !== undefined) {
    return rates.baseRequest + durationSeconds * rates.costPerSecond;
  }

  // 5. Per-kchar (flat fee + character charge)
  if (rates.costPerKChar !== undefined && charCount !== undefined) {
    return rates.baseRequest + (charCount / 1000) * rates.costPerKChar;
  }

  // 6. Fallback: fixed per-request
  return rates.baseRequest;
}

/**
 * Sum additive cost components from model.costAddons (e.g. web search, high thinking).
 */
function computeAddonUsd(
  model: AIModel,
  modelSettings: Record<string, unknown> | undefined,
): number {
  if (!model.costAddons || !modelSettings) return 0;
  let total = 0;
  for (const addon of model.costAddons) {
    const val = String(modelSettings[addon.settingKey] ?? "");
    total += addon.map[val] ?? 0;
  }
  return total;
}

/**
 * Compute LLM per-token USD cost.
 */
function computeLlmUsd(rates: ResolvedRates, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * rates.inputCostPerMToken + outputTokens * rates.outputCostPerMToken) / 1_000_000
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate the internal token cost for a request.
 *
 * Billing mode is determined by which cost fields are set on the model:
 *   - costMatrix              → exact table lookup (setting values → USD)
 *   - costUsdPerMPixel        → per-megapixel (image models)
 *   - costUsdPerMVideoToken   → per-video-token (Seedance-style)
 *   - costUsdPerSecond        → per-second + flat costUsdPerRequest (video/audio)
 *   - costUsdPerKChar         → per-kchar + flat costUsdPerRequest (TTS)
 *   - costUsdPerRequest       → fixed per-request (fallback)
 *   - inputCostUsdPerMToken   → per-token in+out (LLM)
 *
 * costVariants and contextPricingTiers can override any of the above.
 * costAddons are summed on top of the base cost.
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
  extra?: { inputMegapixels?: number; hasInputImage?: boolean },
): number {
  const rates = resolveRates(model, inputTokens, modelSettings);
  const mediaUsd = computeMediaBaseUsd(model, rates, {
    megapixels,
    inputMegapixels: extra?.inputMegapixels,
    hasInputImage: extra?.hasInputImage,
    videoTokens,
    durationSeconds,
    charCount,
    modelSettings,
  });
  const addonUsd = computeAddonUsd(model, modelSettings);
  const llmUsd = computeLlmUsd(rates, inputTokens, outputTokens);
  return usdToTokens(mediaUsd + addonUsd + llmUsd);
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
  actualFps?: number,
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

  const fps = actualFps ?? model.videoFps;
  return (w * h * fps * duration) / 1024;
}
