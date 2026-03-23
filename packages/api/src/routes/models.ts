import type { FastifyPluginAsync } from "fastify";
import { AI_MODELS, MODELS_BY_SECTION, type AIModel } from "@metabox/shared";
import { calculateCost } from "../services/token.service.js";

/** Typical message size used for LLM cost estimation */
const TYPICAL_INPUT_TOKENS = 500;
const TYPICAL_OUTPUT_TOKENS = 500;

function serializeModel(m: AIModel) {
  const isLLM = m.inputCostUsdPerMToken > 0;
  const isPerMPixel = (m.costUsdPerMPixel ?? 0) > 0;
  return {
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
    /** Fixed cost per request in internal tokens (0 for LLM and per-MP models) */
    tokenCostPerRequest: isLLM || isPerMPixel ? 0 : calculateCost(m),
    /** Estimated cost per message in internal tokens (LLM only, based on typical msg size) */
    tokenCostApproxMsg: isLLM ? calculateCost(m, TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS) : 0,
    /** Cost per megapixel in internal tokens (only for per-megapixel billing models, e.g. FLUX) */
    tokenCostPerMPixel: isPerMPixel ? calculateCost(m, 0, 0, 1) : 0,
    isLLM,
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
