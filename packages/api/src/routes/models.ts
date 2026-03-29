import type { FastifyPluginAsync } from "fastify";
import {
  AI_MODELS,
  MODEL_FAMILIES,
  MODELS_BY_SECTION,
  config,
  type AIModel,
} from "@metabox/shared";
import { calculateCost } from "../services/token.service.js";

/** Typical message size used for LLM cost estimation */
const TYPICAL_INPUT_TOKENS = 500;
const TYPICAL_OUTPUT_TOKENS = 500;

function serializeModel(m: AIModel) {
  const isLLM = m.inputCostUsdPerMToken > 0;
  const isPerMPixel = (m.costUsdPerMPixel ?? 0) > 0;
  const isPerMVideoToken = (m.costUsdPerMVideoToken ?? 0) > 0;
  const isPerSecond = (m.costUsdPerSecond ?? 0) > 0;
  return {
    /** Family id this model belongs to, null for standalone models. */
    familyId: m.familyId ?? null,
    /** Display name of the family (includes emoji), null for standalone models. */
    familyName: m.familyId ? (MODEL_FAMILIES[m.familyId]?.name ?? null) : null,
    /** Default model ID for the family (used to pre-select variant before activation). */
    familyDefaultModelId: m.familyId ? (MODEL_FAMILIES[m.familyId]?.defaultModelId ?? null) : null,
    /** Version label within the family, e.g. "v3", "v4". */
    versionLabel: m.versionLabel ?? null,
    /** Variant label within the family, e.g. "Standard", "Pro". */
    variantLabel: m.variantLabel ?? null,
    /** Per-variant description override (replaces family description when set). */
    descriptionOverride: m.descriptionOverride ?? null,
    id: m.id,
    name: m.name,
    description: m.description,
    section: m.section,
    provider: m.provider,
    supportsImages: m.supportsImages,
    supportsVoice: m.supportsVoice,
    supportsWeb: m.supportsWeb,
    isAsync: m.isAsync,
    supportedAspectRatios: m.supportedAspectRatios ?? null,
    supportedDurations: m.supportedDurations ?? null,
    durationRange: m.durationRange ?? null,
    /** Fixed cost per request in internal tokens (0 for LLM, per-MP, and per-video-token models) */
    tokenCostPerRequest: isLLM || isPerMPixel || isPerMVideoToken ? 0 : calculateCost(m),
    /** Estimated cost per message in internal tokens (LLM only, based on typical msg size) */
    tokenCostApproxMsg: isLLM ? calculateCost(m, TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS) : 0,
    /** Cost per megapixel in internal tokens (only for per-megapixel billing models, e.g. FLUX) */
    tokenCostPerMPixel: isPerMPixel ? calculateCost(m, 0, 0, 1) : 0,
    /**
     * Cost per 1M video tokens in internal tokens (only for per-video-token billing models, e.g. Seedance).
     * videoTokens = (width × height × fps × duration) / 1024
     */
    tokenCostPerMVideoToken: isPerMVideoToken ? calculateCost(m, 0, 0, undefined, 1_000_000) : 0,
    /** FPS used in video token calculation (only for per-video-token billing models). */
    videoFps: m.videoFps ?? 0,
    /** Cost per second in internal tokens (only for per-second billing models, e.g. Kling, Pika). */
    tokenCostPerSecond: isPerSecond
      ? calculateCost(m, 0, 0, undefined, undefined, undefined, 1)
      : 0,
    isLLM,
    /** Configurable generation parameters. Empty array if none. */
    settings: m.settings ?? [],
    /**
     * Multi-dimensional cost table (internal tokens) for models where price depends on 2+ settings.
     * e.g. gpt-image-1.5: quality × size. null for models without multi-dim pricing.
     */
    costMatrix: m.costMatrix
      ? {
          dims: m.costMatrix.dims,
          table: Object.fromEntries(
            Object.entries(m.costMatrix.table).map(([k, v]) => [
              k,
              (v / config.billing.usdPerToken) * config.billing.targetMargin,
            ]),
          ),
        }
      : null,
    /**
     * Token cost per variant value (only for models with costVariants).
     * Per-second models: tokens per 1 second for each variant.
     * Per-request models: total tokens per request for each variant.
     * null if model has no costVariants.
     */
    tokenCostVariants:
      !isLLM && !isPerMPixel && !isPerMVideoToken && m.costVariants
        ? {
            settingKey: m.costVariants.settingKey,
            map: Object.fromEntries(
              Object.keys(m.costVariants.map).map((k) => [
                k,
                calculateCost(
                  m,
                  0,
                  0,
                  undefined,
                  undefined,
                  { [m.costVariants!.settingKey]: k },
                  isPerSecond ? 1 : undefined,
                ),
              ]),
            ),
          }
        : null,
    /**
     * Additive token cost per setting value (only for models with costAddons).
     * Frontend sums these on top of the base cost.
     * null if model has no costAddons.
     */
    tokenCostAddons: m.costAddons?.length
      ? m.costAddons.map((addon) => ({
          settingKey: addon.settingKey,
          map: Object.fromEntries(
            Object.entries(addon.map).map(([k, v]) => [
              k,
              ((v as number) / config.billing.usdPerToken) * config.billing.targetMargin,
            ]),
          ),
        }))
      : null,
  };
}

export const modelsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /models?section=gpt — list all models or filter by section */
  fastify.get<{ Querystring: { section?: string } }>("/models", async (request) => {
    const { section } = request.query;

    const models = section ? (MODELS_BY_SECTION[section] ?? []) : Object.values(AI_MODELS);

    return models.map(serializeModel);
  });
};
