import type { FastifyPluginAsync } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { config } from "@metabox/shared";

interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio: string | null;
}

interface HeyGenVoicesResponse {
  data?: {
    voices?: HeyGenVoice[];
  };
}

export const heygenVoicesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /heygen-voices — proxy to HeyGen v2/voices, returns simplified voice list */
  fastify.get("/heygen-voices", async (_request, reply) => {
    const apiKey = config.ai.heygen;
    if (!apiKey) {
      return reply.status(503).send({ error: "HeyGen API key not configured" });
    }

    const res = await fetch("https://api.heygen.com/v2/voices", {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return reply.status(502).send({ error: `HeyGen error: ${res.status} ${text}` });
    }

    const json = (await res.json()) as HeyGenVoicesResponse;
    const voices = json.data?.voices ?? [];

    return voices.map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      language: v.language ?? "",
      gender: v.gender ?? "",
      preview_audio: v.preview_audio ?? null,
    }));
  });
};
