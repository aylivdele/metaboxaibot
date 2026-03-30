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

export const heygenAvatarsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /**
   * GET /heygen-avatars — proxy to HeyGen /v3/avatars/looks (public only) with cursor pagination.
   * Query params:
   *   token  — opaque cursor for the next page (omit for first page)
   *   limit  — items per page (default 20, max 50)
   *   gender — filter: male | female (omit for all)
   *   search — name substring filter (case-insensitive, applied before returning)
   *
   * Response: { items, has_more, next_token }
   */
  fastify.get<{
    Querystring: { token?: string; limit?: string; gender?: string; search?: string };
  }>("/heygen-avatars", async (request, reply) => {
    const apiKey = config.ai.heygen;
    if (!apiKey) {
      return reply.status(503).send({ error: "HeyGen API key not configured" });
    }

    const { token, gender, search } = request.query;
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));

    const url = new URL("https://api.heygen.com/v3/avatars/looks");
    url.searchParams.set("ownership", "public");
    url.searchParams.set("limit", String(limit));
    if (token) url.searchParams.set("token", token);

    const res = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return reply.status(502).send({ error: `HeyGen error: ${res.status} ${text}` });
    }

    const page = (await res.json()) as HeyGenLooksPage;
    let items = (page.data ?? []).map((l) => ({
      avatar_id: l.id,
      avatar_name: l.name,
      gender: l.gender ?? "",
      preview_image_url: l.preview_image_url ?? null,
    }));

    // Apply client-requested filters on the server before returning
    if (gender && gender !== "all") {
      items = items.filter((a) => a.gender === gender);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((a) => a.avatar_name.toLowerCase().includes(q));
    }

    return {
      items,
      has_more: page.has_more ?? false,
      next_token: page.next_token ?? null,
    };
  });
};
