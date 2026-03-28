import type { AIModel, Translations } from "@metabox/shared";
import { calculateCost, computeVideoTokens } from "@metabox/api/services";

/**
 * Builds a localised cost-line string for the model activation message.
 * Picks the right unit label based on the model's pricing type:
 *   costUsdPerMPixel     → "X.XX ✦ за мегапиксель"  (1 MP baseline)
 *   costUsdPerSecond     → "X.XX ✦ за секунду"       (1-second baseline)
 *   costUsdPerKChar      → "X.XX ✦ за 1К символов"   (1K-char baseline)
 *   everything else      → "X.XX ✦ за запрос"         (estimated with defaultDuration)
 */
export function buildCostLine(
  model: AIModel,
  modelSettings: Record<string, unknown>,
  t: Translations,
  defaultDuration?: number,
): string {
  if (model.costUsdPerMPixel) {
    const cost = calculateCost(model, 0, 0, 1.0, undefined, modelSettings);
    return t.common.costPerMPixel.replace("{cost}", cost.toFixed(2));
  }

  if (model.costUsdPerSecond !== undefined) {
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings, 1);
    return t.common.costPerSecond.replace("{cost}", cost.toFixed(2));
  }

  if (model.costUsdPerKChar !== undefined) {
    const cost = calculateCost(model, 0, 0, undefined, undefined, modelSettings, undefined, 1000);
    return t.common.costPerKChar.replace("{cost}", cost.toFixed(2));
  }

  // Per-video-token models (e.g. Seedance): estimate with default duration
  const estimatedVideoTokens =
    model.costUsdPerMVideoToken && defaultDuration
      ? computeVideoTokens(model, undefined, defaultDuration)
      : undefined;

  const cost = calculateCost(
    model,
    0,
    0,
    undefined,
    estimatedVideoTokens,
    modelSettings,
    defaultDuration,
  );
  return t.common.costPerRequest.replace("{cost}", cost.toFixed(2));
}
