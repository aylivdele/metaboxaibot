/**
 * Provider-agnostic rate-limit / concurrency error classifier.
 *
 * Async generation providers (fal, runway, heygen, google, openai, higgsfield,
 * luma, minimax, pika, alibaba…) all have their own ways of signalling
 * "back off" — HTTP 429, custom error codes, JSON bodies with `RESOURCE_EXHAUSTED`,
 * plain-text "too many requests in flight". This module collapses them into a
 * single boolean + a cooldown hint + a long-window flag.
 *
 * The long-window flag is a heuristic — daily/monthly quotas can't always be
 * distinguished from per-minute bursts on first contact. We err on "short" by
 * default and graduate the detection list as we see new error shapes in
 * production.
 */

/** Per-provider cooldown when the error doesn't carry a Retry-After hint. */
const COOLDOWN_MS: Record<string, number> = {
  fal: 60_000,
  runway: 60_000,
  heygen: 60_000,
  google: 60_000,
  openai: 60_000,
  higgsfield: 90_000,
  luma: 60_000,
  minimax: 60_000,
  pika: 60_000,
  alibaba: 60_000,
  replicate: 60_000,
  elevenlabs: 60_000,
  suno: 60_000,
  did: 60_000,
};
const DEFAULT_COOLDOWN_MS = 60_000;

/** If a detected cooldown exceeds this, we treat it as a long-window quota. */
export const LONG_WINDOW_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/** Patterns that strongly suggest a daily/monthly quota, not a per-minute burst. */
const LONG_WINDOW_PATTERNS: RegExp[] = [
  /daily quota/i,
  /daily limit/i,
  /monthly quota/i,
  /monthly limit/i,
  /quota exceeded for/i,
  /usage limit/i,
  /trial limit/i,
  /out of credits/i,
  /insufficient credits/i,
  /credit exhausted/i,
  /account.*suspended/i,
  /tier limit/i,
];

/** Patterns that mark an error as rate-limit / concurrency related.
 *
 * Намеренно НЕ включаем общие "try again later" / "please retry" — провайдеры
 * (Anthropic, OpenAI, kie и т.п.) шлют их в обычных 5xx-ошибках типа
 * "Server exception, please try again later" — это transient server failure,
 * а не rate-limit. Реальные rate-limit'ы и так матчатся через 429 status,
 * "rate limit" / "too many requests" / "quota" / "throttle". */
const RATE_LIMIT_PATTERNS: RegExp[] = [
  /rate limit/i,
  /rate_limit/i,
  /too many requests/i,
  /too_many_requests/i,
  /resource_exhausted/i,
  /quota/i,
  /concurrency/i,
  /concurrent (request|generation)/i,
  /throttl/i,
  // Provider-side overload (e.g. KIE 422 "Service is currently unavailable
  // due to high demand. Please try again later. (E003)") — транзиентный отказ
  // на стороне провайдера, не error в нашем запросе. Применяем backoff
  // вместо немедленного fail'а.
  /high demand/i,
  /service is (currently )?unavailable/i,
  /service unavailable/i,
];

export interface RateLimitClassification {
  isRateLimit: boolean;
  /** Recommended cooldown in ms. Only meaningful if `isRateLimit` is true. */
  cooldownMs: number;
  /** True if this looks like a long-window (daily/monthly) quota — caller should fail the job. */
  isLongWindow: boolean;
  /** Short reason string for logs / Redis gate value. */
  reason: string;
}

interface ErrorLike {
  status?: number;
  statusCode?: number;
  code?: string | number;
  message?: string;
  headers?: Record<string, string | string[] | undefined>;
  response?: { status?: number; headers?: Record<string, string | string[] | undefined> };
}

function asErrorLike(err: unknown): ErrorLike {
  if (err && typeof err === "object") return err as ErrorLike;
  return { message: typeof err === "string" ? err : undefined };
}

function getStatus(e: ErrorLike): number | undefined {
  return e.status ?? e.statusCode ?? e.response?.status;
}

function getMessage(e: ErrorLike): string {
  if (typeof e.message === "string") return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Parse a Retry-After header value (seconds or HTTP-date) into ms. */
function parseRetryAfter(headers?: Record<string, string | string[] | undefined>): number | null {
  if (!headers) return null;
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber * 1000);
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

/**
 * Returns true if the error looks like an HTTP 5xx response.
 * Используется в fallback-логике как «provider transient failure» сигнал,
 * отличный от 429 (rate-limit) и валидационных 4xx.
 */
export function isFiveXxError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
  const status = e.status ?? e.statusCode ?? e.response?.status;
  return typeof status === "number" && status >= 500 && status < 600;
}

/** Classify an arbitrary thrown error as rate-limit-related or not. */
export function classifyRateLimit(err: unknown, provider?: string): RateLimitClassification {
  const e = asErrorLike(err);
  const status = getStatus(e);
  const message = getMessage(e);
  const code = typeof e.code === "string" ? e.code : undefined;

  const matchesPattern = RATE_LIMIT_PATTERNS.some((p) => p.test(message));
  const isRateLimit =
    status === 429 ||
    code === "RESOURCE_EXHAUSTED" ||
    code === "rate_limit_exceeded" ||
    code === "TOO_MANY_REQUESTS" ||
    matchesPattern;

  if (!isRateLimit) {
    return { isRateLimit: false, cooldownMs: 0, isLongWindow: false, reason: "" };
  }

  const retryAfterMs = parseRetryAfter(e.headers) ?? parseRetryAfter(e.response?.headers) ?? null;

  const baseCooldown =
    (provider ? COOLDOWN_MS[provider.toLowerCase()] : undefined) ?? DEFAULT_COOLDOWN_MS;
  const cooldownMs = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : baseCooldown;

  const isLongWindow =
    LONG_WINDOW_PATTERNS.some((p) => p.test(message)) || cooldownMs > LONG_WINDOW_THRESHOLD_MS;

  const reason = `${status ?? code ?? "rate_limit"}: ${message.slice(0, 160)}`;

  return { isRateLimit: true, cooldownMs, isLongWindow, reason };
}
