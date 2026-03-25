import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { PLANS } from "@metabox/shared";
import { getAiBotCatalog } from "../services/metabox-bridge.service.js";
import { getRate, calcStars } from "../services/exchange-rate.service.js";
import type { AiBotCatalog } from "../services/metabox-bridge.service.js";

type AuthRequest = FastifyRequest & { userId: bigint };

/** Fallback catalog built from hardcoded PLANS when Metabox API is unavailable. */
function fallbackCatalog(): AiBotCatalog {
  return {
    subscriptions: [],
    tokenPackages: PLANS.map((p) => ({
      id: p.id,
      name: p.label,
      tokens: p.tokens,
      priceRub: p.priceRub.toFixed(2),
      badge: p.popular ? "Популярный" : null,
    })),
  };
}

export const tariffsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /**
   * GET /tariffs/catalog
   * Returns unified catalog of subscriptions + token packages with Stars prices.
   * Falls back to hardcoded PLANS if Metabox catalog API is unavailable.
   */
  fastify.get("/tariffs/catalog", async (request) => {
    const { userId } = request as AuthRequest;

    // Fetch catalog from Metabox (with fallback) + exchange rate in parallel
    const [catalog, usdtRubRate, user] = await Promise.all([
      getAiBotCatalog().catch((err) => {
        console.warn("[tariffs/catalog] Metabox catalog unavailable, using fallback:", err.message);
        return fallbackCatalog();
      }),
      getRate(),
      db.user.findUnique({
        where: { id: userId },
        select: { metaboxUserId: true },
      }),
    ]);

    // Enrich subscriptions with Stars prices for each period
    const subscriptions = catalog.subscriptions.map((sub) => {
      const monthly = Number(sub.priceMonthly);
      const d3 = Number(sub.discount3m);
      const d6 = Number(sub.discount6m);
      const d12 = Number(sub.discount12m);

      const priceM1 = monthly;
      const priceM3 = monthly * 3 * (1 - d3 / 100);
      const priceM6 = monthly * 6 * (1 - d6 / 100);
      const priceM12 = monthly * 12 * (1 - d12 / 100);

      return {
        id: sub.id,
        name: sub.name,
        tokens: sub.tokens,
        periods: {
          M1: { priceRub: priceM1.toFixed(2), stars: calcStars(priceM1, usdtRubRate) },
          M3: { priceRub: priceM3.toFixed(2), stars: calcStars(priceM3, usdtRubRate) },
          M6: { priceRub: priceM6.toFixed(2), stars: calcStars(priceM6, usdtRubRate) },
          M12: { priceRub: priceM12.toFixed(2), stars: calcStars(priceM12, usdtRubRate) },
        },
      };
    });

    // Enrich token packages with Stars prices
    const tokenPackages = catalog.tokenPackages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      tokens: pkg.tokens,
      priceRub: pkg.priceRub,
      stars: calcStars(Number(pkg.priceRub), usdtRubRate),
      badge: pkg.badge,
    }));

    return {
      subscriptions,
      tokenPackages,
      canPayByCard: !!user?.metaboxUserId,
      usdtRubRate,
    };
  });
};
