import type { FastifyPluginAsync } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { config } from "@metabox/shared";

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string | null;
  preview_video_url: string | null;
}

interface HeyGenAvatarsResponse {
  data?: {
    avatars?: HeyGenAvatar[];
  };
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let avatarsCache: { data: object[]; at: number } | null = null;

export const heygenAvatarsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /heygen-avatars — proxy to HeyGen /v2/avatars, returns simplified avatar list */
  fastify.get("/heygen-avatars", async (_request, reply) => {
    if (avatarsCache && Date.now() - avatarsCache.at < CACHE_TTL_MS) {
      return avatarsCache.data;
    }

    const apiKey = config.ai.heygen;
    if (!apiKey) {
      return reply.status(503).send({ error: "HeyGen API key not configured" });
    }

    const res = await fetch("https://api.heygen.com/v2/avatars", {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return reply.status(502).send({ error: `HeyGen error: ${res.status} ${text}` });
    }

    const json = (await res.json()) as HeyGenAvatarsResponse;
    const avatars = json.data?.avatars ?? [];

    const data = avatars.map((a) => ({
      avatar_id: a.avatar_id,
      avatar_name: a.avatar_name,
      gender: a.gender ?? "",
      preview_image_url: a.preview_image_url ?? null,
    }));

    avatarsCache = { data, at: Date.now() };
    return data;
  });
};
