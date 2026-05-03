import type { FastifyPluginAsync } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { config } from "@metabox/shared";

interface CartesiaVoiceRaw {
  id: string;
  name: string;
  description?: string;
  is_owner?: boolean;
  is_public?: boolean;
  gender?: string | null;
  language?: string;
  created_at?: string;
  preview_file_url?: string | null;
}

interface CartesiaVoicesResponse {
  data?: CartesiaVoiceRaw[];
  has_more?: boolean;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let voicesCache: { data: object[]; at: number } | null = null;

const CARTESIA_VERSION = "2026-03-01";
const CARTESIA_API = "https://api.cartesia.ai";

export const cartesiaVoicesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /**
   * GET /cartesia-voices — список официальных (public) Cartesia voices.
   * is_owner=false → исключает наших клонированных голосов (они отдаются через
   * /user-voices). expand[]=preview_file_url включает поле для проигрывания.
   * Кэш 1ч — official-каталог редко меняется.
   */
  fastify.get("/cartesia-voices", async (_request, reply) => {
    if (voicesCache && Date.now() - voicesCache.at < CACHE_TTL_MS) {
      return voicesCache.data;
    }

    const apiKey = config.ai.cartesia;
    if (!apiKey) {
      return reply.status(503).send({ error: "Cartesia API key not configured" });
    }

    const all: CartesiaVoiceRaw[] = [];
    let cursor: string | undefined;
    // Cap pages at 50 — официальных голосов не должно быть >5000.
    for (let page = 0; page < 50; page++) {
      const url = new URL(`${CARTESIA_API}/voices`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("is_owner", "false");
      url.searchParams.append("expand[]", "preview_file_url");
      if (cursor) url.searchParams.set("starting_after", cursor);

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Cartesia-Version": CARTESIA_VERSION,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return reply.status(502).send({ error: `Cartesia error: ${res.status} ${text}` });
      }

      const json = (await res.json()) as CartesiaVoicesResponse;
      const data = json.data ?? [];
      all.push(...data);
      if (!json.has_more || data.length === 0) break;
      cursor = data[data.length - 1].id;
    }

    const data = all.map((v) => ({
      voice_id: v.id,
      name: v.name,
      description: v.description ?? null,
      gender: v.gender ?? null,
      language: v.language ?? null,
      preview_url: v.preview_file_url ?? null,
    }));

    voicesCache = { data, at: Date.now() };
    return data;
  });
};
