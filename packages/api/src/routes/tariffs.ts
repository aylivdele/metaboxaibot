import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { db } from "../db.js";
import { config } from "@metabox/shared";
import { getAiBotCatalog } from "../services/metabox-bridge.service.js";
import { getRate, calcStars } from "../services/exchange-rate.service.js";
import type { AiBotCatalog } from "../services/metabox-bridge.service.js";

type AuthRequest = FastifyRequest & { userId: bigint };

/** Empty catalog when Metabox API is unavailable — no fallback to hardcoded plans */
function emptyCatalog(): AiBotCatalog {
  return { subscriptions: [], tokenPackages: [] };
}

export const tariffsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /**
   * GET /tariffs/catalog
   * Returns unified catalog of subscriptions + token packages with Stars prices.
   * Returns empty catalog if Metabox API is unavailable.
   */
  fastify.get("/tariffs/catalog", async (request) => {
    const { userId } = request as AuthRequest;

    // Fetch catalog from Metabox (with fallback) + exchange rate in parallel
    const [catalog, usdtRubRate, user] = await Promise.all([
      getAiBotCatalog().catch((err) => {
        console.error("[tariffs/catalog] Metabox catalog unavailable:", err.message);
        return emptyCatalog();
      }),
      getRate(),
      db.user.findUnique({
        where: { id: userId },
        select: { metaboxUserId: true },
      }),
    ]);

    // Enrich subscriptions with Stars prices — only include available periods
    const subscriptions = catalog.subscriptions.map((sub) => {
      const monthly = Number(sub.priceMonthly);
      const d3 = Number(sub.discount3m);
      const d6 = Number(sub.discount6m);
      const d12 = Number(sub.discount12m);

      // M1 is always available; other periods only if discount > 0
      const periods: Record<string, { priceRub: string; stars: number }> = {};

      const priceM1 = Math.round(monthly);
      periods.M1 = { priceRub: priceM1.toFixed(2), stars: calcStars(priceM1, usdtRubRate) };

      if (d3 > 0) {
        const priceM3 = Math.round(monthly * 3 * (1 - d3 / 100));
        periods.M3 = { priceRub: priceM3.toFixed(2), stars: calcStars(priceM3, usdtRubRate) };
      }
      if (d6 > 0) {
        const priceM6 = Math.round(monthly * 6 * (1 - d6 / 100));
        periods.M6 = { priceRub: priceM6.toFixed(2), stars: calcStars(priceM6, usdtRubRate) };
      }
      if (d12 > 0) {
        const priceM12 = Math.round(monthly * 12 * (1 - d12 / 100));
        periods.M12 = { priceRub: priceM12.toFixed(2), stars: calcStars(priceM12, usdtRubRate) };
      }

      return {
        id: sub.id,
        name: sub.name,
        tokens: sub.tokens,
        periods,
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
      metaboxUrl: config.metabox.apiUrl || "https://app.meta-box.ru",
    };
  });
};
