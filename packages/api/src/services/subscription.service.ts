import { db } from "../db.js";
import { expireSubscription } from "./payment.service.js";

/**
 * Find all users whose subscription has expired but still have a non-zero
 * subscriptionTokenBalance, and zero them out.
 */
export async function deactivateExpiredSubscriptions(): Promise<void> {
  // Find expired subscriptions from LocalSubscription (single source of truth)
  const expired = await db.localSubscription.findMany({
    where: {
      endDate: { lte: new Date() },
      isActive: true,
    },
    select: { userId: true },
  });

  for (const sub of expired) {
    await expireSubscription(sub.userId);
  }
}

/** Start the subscription expiry scheduler. Call once on app startup. */
export function startSubscriptionScheduler(): void {
  // Run once immediately on startup
  deactivateExpiredSubscriptions().catch((e) =>
    console.error("[subscription] Startup expiry check failed:", e),
  );

  // Check every hour
  setInterval(
    () => {
      deactivateExpiredSubscriptions().catch((e) =>
        console.error("[subscription] Scheduled expiry check failed:", e),
      );
    },
    60 * 60 * 1000,
  );
}
