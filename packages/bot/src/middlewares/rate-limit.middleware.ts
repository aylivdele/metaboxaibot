import type { BotContext } from "../types/context.js";
import type { NextFunction } from "grammy";

interface UserBucket {
  tokens: number;
  lastRefill: number;
}

const CAPACITY = 55; // max burst
const REFILL_RATE = 2; // tokens per second
const REFILL_INTERVAL_MS = 1000;

const buckets = new Map<string, UserBucket>();

function getBucket(userId: string): UserBucket {
  const now = Date.now();
  let bucket = buckets.get(userId);

  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(userId, bucket);
    return bucket;
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / REFILL_INTERVAL_MS) * REFILL_RATE;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill);
  bucket.lastRefill = now;

  return bucket;
}

/**
 * Grammy middleware: token-bucket rate limiter per user.
 * Silently drops messages when the bucket is empty.
 */
export async function rateLimitMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id?.toString();
  if (!userId) return next();

  const bucket = getBucket(userId);

  if (bucket.tokens < 1) {
    // Rate limit exceeded — optionally notify the user once
    await ctx.reply("⏱ Too many requests. Please slow down.").catch(() => void 0);
    return;
  }

  bucket.tokens -= 1;
  return next();
}
