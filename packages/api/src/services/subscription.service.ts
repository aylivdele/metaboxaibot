import { db } from "../db.js";
import { expireSubscription } from "./payment.service.js";

/**
 * Find all users whose subscription has expired but still have a non-zero
 * subscriptionTokenBalance, and zero them out.
 */
export async function deactivateExpiredSubscriptions(): Promise<void> {
  const expired = await db.user.findMany({
    where: {
      subscriptionEndDate: { lte: new Date() },
      subscriptionTokenBalance: { gt: 0 },
    },
    select: { id: true },
  });

  for (const user of expired) {
    await expireSubscription(user.id);
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
