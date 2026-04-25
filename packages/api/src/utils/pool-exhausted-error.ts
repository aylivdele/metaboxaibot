/**
 * Бросается KeyPool, когда все активные ключи провайдера на cooldown'е.
 * Worker'ы ловят его и ре-енкьюят job через `retryAfterMs + jitter`.
 */
export class PoolExhaustedError extends Error {
  constructor(
    public readonly provider: string,
    public readonly retryAfterMs: number,
  ) {
    super(`No available API keys for provider "${provider}" (retry in ${retryAfterMs}ms)`);
    this.name = "PoolExhaustedError";
  }
}

export function isPoolExhaustedError(err: unknown): err is PoolExhaustedError {
  return err instanceof PoolExhaustedError;
}
