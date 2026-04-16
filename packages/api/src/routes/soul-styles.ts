import type { FastifyPluginAsync } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { config } from "@metabox/shared";
import { logger } from "../logger.js";

interface SoulStyle {
  id: string;
  name: string;
  description?: string | null;
  preview_url: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let stylesCache: { data: SoulStyle[]; at: number } | null = null;

export const soulStylesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /soul-styles — proxy to Higgsfield Cloud /v1/text2image/soul-styles with 1-hour cache */
  fastify.get("/soul-styles", async (_request, reply) => {
    if (stylesCache && Date.now() - stylesCache.at < CACHE_TTL_MS) {
      return stylesCache.data;
    }

    const apiKey = config.ai.higgsfieldApiKey;
    const apiSecret = config.ai.higgsfieldApiSecret;
    if (!apiKey || !apiSecret) {
      return reply.status(503).send({ error: "Higgsfield API key not configured" });
    }

    const res = await fetch("https://cloud.higgsfield.ai/v1/text2image/soul-styles", {
      headers: {
        "hf-api-key": apiKey,
        "hf-secret": apiSecret,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text }, "Higgsfield soul-styles fetch failed");
      return reply.status(502).send({ error: `Higgsfield error: ${res.status} ${text}` });
    }

    const data = (await res.json()) as SoulStyle[];
    logger.info({ count: data.length }, "Higgsfield soul-styles fetched");
    stylesCache = { data, at: Date.now() };
    return data;
  });
};
