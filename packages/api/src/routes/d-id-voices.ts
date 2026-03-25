import type { FastifyPluginAsync } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { config } from "@metabox/shared";

interface DIDVoice {
  id: string;
  name: string;
  gender: string;
  language: string;
  provider: string;
  styles?: string[];
  description?: string;
}

interface DIDVoicesResponse {
  voices?: DIDVoice[];
}

export const didVoicesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /d-id-voices — proxy to D-ID /tts/voices, returns simplified voice list */
  fastify.get("/d-id-voices", async (_request, reply) => {
    const apiKey = config.ai.did;
    if (!apiKey) {
      return reply.status(503).send({ error: "D-ID API key not configured" });
    }

    const encoded = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch("https://api.d-id.com/tts/voices", {
      headers: { Authorization: `Basic ${encoded}`, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return reply.status(502).send({ error: `D-ID error: ${res.status} ${text}` });
    }

    const json = (await res.json()) as DIDVoicesResponse;
    const voices = json.voices ?? [];

    return voices.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender ?? "",
      language: v.language ?? "",
      provider: v.provider ?? "microsoft",
      styles: v.styles ?? [],
      description: v.description ?? "",
    }));
  });
};
