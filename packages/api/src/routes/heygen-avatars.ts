import type { FastifyPluginAsync } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { config } from "@metabox/shared";

interface HeyGenLookItem {
  id: string;
  name: string;
  gender?: string | null;
  preview_image_url?: string | null;
}

interface HeyGenLooksPage {
  data?: HeyGenLookItem[];
  has_more?: boolean;
  next_token?: string | null;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let avatarsCache: { data: object[]; at: number } | null = null;

/** Fetch all looks with cursor-based pagination. */
async function fetchAllLooks(apiKey: string): Promise<HeyGenLookItem[]> {
  const results: HeyGenLookItem[] = [];
  let nextToken: string | null | undefined = undefined;

  do {
    const url = new URL("https://api.heygen.com/v3/avatars/looks");
    url.searchParams.set("limit", "50");
    if (nextToken) url.searchParams.set("token", nextToken);

    const res = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HeyGen /v3/avatars/looks error: ${res.status} ${text}`);
    }

    const page = (await res.json()) as HeyGenLooksPage;
    results.push(...(page.data ?? []));
    nextToken = page.has_more ? page.next_token : null;
  } while (nextToken);

  return results;
}

export const heygenAvatarsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** GET /heygen-avatars — proxy to HeyGen /v3/avatars/looks, returns simplified avatar list */
  fastify.get("/heygen-avatars", async (_request, reply) => {
    if (avatarsCache && Date.now() - avatarsCache.at < CACHE_TTL_MS) {
      return avatarsCache.data;
    }

    const apiKey = config.ai.heygen;
    if (!apiKey) {
      return reply.status(503).send({ error: "HeyGen API key not configured" });
    }

    let looks: HeyGenLookItem[];
    try {
      looks = await fetchAllLooks(apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: msg });
    }

    const data = looks.map((l) => ({
      avatar_id: l.id,
      avatar_name: l.name,
      gender: l.gender ?? "",
      preview_image_url: l.preview_image_url ?? null,
    }));

    avatarsCache = { data, at: Date.now() };
    return data;
  });
};
