import type { FastifyPluginAsync } from "fastify";
import { AI_MODELS, MODELS_BY_SECTION } from "@metabox/shared";

export const modelsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /models?section=gpt — list all models or filter by section */
  fastify.get<{ Querystring: { section?: string } }>("/models", async (request) => {
    const { section } = request.query;

    if (section) {
      return MODELS_BY_SECTION[section] ?? [];
    }

    return Object.values(AI_MODELS).map((m) => ({
      id: m.id,
      name: m.name,
      section: m.section,
      provider: m.provider,
      costUsdPerRequest: m.costUsdPerRequest,
      supportsImages: m.supportsImages,
      supportsVoice: m.supportsVoice,
      isAsync: m.isAsync,
    }));
  });
};
