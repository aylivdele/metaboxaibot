/**
 * Tiered polling schedule for long-running provider jobs.
 *
 *   elapsed 0..1 min      → every 5 s
 *   elapsed 1..5 min      → every 20 s
 *   elapsed 5..30 min     → every 1 min
 *   elapsed 30..120 min   → every 5 min
 *   elapsed 120 min..24 h → every 30 min
 *   elapsed >= 24 h       → stop (timeout)
 */

export const POLL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the interval (in ms) to wait before the next poll, based on how long
 * the job has already been running. Returns `null` once the 24 h timeout is hit.
 */
export function getIntervalForElapsed(elapsedMs: number): number | null {
  if (elapsedMs >= POLL_TIMEOUT_MS) return null;
  if (elapsedMs < 60 * 1000) return 5 * 1000; // < 1 min → 5 s
  if (elapsedMs < 5 * 60 * 1000) return 20 * 1000; // 1–5 min → 20 s
  if (elapsedMs < 30 * 60 * 1000) return 60 * 1000; // 5–30 min → 1 min
  if (elapsedMs < 120 * 60 * 1000) return 5 * 60 * 1000; // 30–120 min → 5 min
  return 30 * 60 * 1000; // 120 min – 24 h → 30 min
}
