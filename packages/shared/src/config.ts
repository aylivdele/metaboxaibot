/**
 * Central config module. Import after `dotenv/config` is loaded.
 *
 * Required vars throw at startup if missing.
 * Optional vars return undefined or a typed default.
 *
 * Usage:
 *   import { config } from "@metabox/shared";
 *   config.bot.token       // string
 *   config.ai.openai       // string | undefined
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[config] Missing required env var: ${name}`);
  return v;
}

function opt(name: string): string | undefined {
  return process.env[name] || undefined;
}

function optDefault<T extends string>(name: string, fallback: T): T {
  return (process.env[name] as T | undefined) ?? fallback;
}

function optInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`[config] ${name} must be an integer, got: "${v}"`);
  return n;
}

function optFloat(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseFloat(v);
  if (isNaN(n)) throw new Error(`[config] ${name} must be a number, got: "${v}"`);
  return n;
}

export const config = {
  /** Runtime environment */
  env: optDefault("NODE_ENV", "development") as "development" | "production" | "test",

  /** Telegram Bot */
  bot: {
    token: req("BOT_TOKEN"),
    webappUrl: opt("WEBAPP_URL"),
  },

  /** Database & cache */
  db: {
    url: req("DATABASE_URL"),
  },
  redis: {
    url: req("REDIS_URL"),
  },

  /** API server */
  api: {
    port: optInt("API_PORT", 3001),
    adminSecret: opt("ADMIN_SECRET"),
  },

  /** Observability */
  log: {
    level: optDefault("LOG_LEVEL", "info"),
  },
  sentry: {
    dsn: opt("SENTRY_DSN"),
  },

  /**
   * Billing parameters.
   * usdPerToken: how many USD one internal token is worth (Pro plan: $0.043).
   * targetMargin: multiplier over provider break-even (2.0 = 2× cost = ~100% gross margin).
   * Override via BILLING_USD_PER_TOKEN / BILLING_TARGET_MARGIN env vars.
   */
  billing: {
    usdPerToken: optFloat("BILLING_USD_PER_TOKEN", 0.043),
    targetMargin: optFloat("BILLING_TARGET_MARGIN", 2.0),
  },

  /**
   * S3-compatible object storage (optional).
   * If S3_BUCKET is not set, file uploads are skipped gracefully.
   * Compatible with AWS S3, Cloudflare R2, MinIO, etc.
   */
  s3: {
    bucket: opt("S3_BUCKET"),
    region: optDefault("S3_REGION", "auto"),
    endpoint: opt("S3_ENDPOINT"), // e.g. https://<account>.r2.cloudflarestorage.com
    accessKeyId: opt("S3_ACCESS_KEY_ID"),
    secretAccessKey: opt("S3_SECRET_ACCESS_KEY"),
    /** Public base URL for direct downloads (e.g. https://cdn.example.com). */
    publicUrl: opt("S3_PUBLIC_URL"),
  },

  /**
   * Admin alerts (optional).
   * ALERT_CHAT_ID — Telegram chat/channel ID to send low-balance notifications.
   * ALERT_INTERVAL_HOURS — how often to check (default: 12).
   * ALERT_FAL_THRESHOLD_USD — alert when FAL balance below this (default: 5).
   * ALERT_ELEVENLABS_THRESHOLD_CHARS — alert when ElevenLabs chars remaining below this (default: 50000).
   */
  alerts: {
    chatId: opt("ALERT_CHAT_ID"),
    /** message_thread_id for supergroup topics (optional). */
    threadId: optInt("ALERT_THREAD_ID", 0) || undefined,
    intervalHours: optFloat("ALERT_INTERVAL_HOURS", 12),
    falThresholdUsd: optFloat("ALERT_FAL_THRESHOLD_USD", 5),
    elevenlabsThresholdChars: optInt("ALERT_ELEVENLABS_THRESHOLD_CHARS", 50_000),
  },

  /**
   * Metabox site integration (optional — only needed for ecosystem linking).
   * METABOX_API_URL      — base URL of Metabox Next.js app, e.g. https://app.meta-box.ru
   * METABOX_INTERNAL_KEY — shared secret for X-Internal-Key header
   * METABOX_SSO_SECRET   — HMAC secret for signing/verifying SSO tokens (same on both apps)
   */
  metabox: {
    apiUrl: opt("METABOX_API_URL"),
    internalKey: opt("METABOX_INTERNAL_KEY"),
    ssoSecret: opt("METABOX_SSO_SECRET"),
  },

  /** AI providers (all optional — only needed for models you enable) */
  ai: {
    openai: opt("OPENAI_API_KEY"),
    openaiAssistantId: opt("OPENAI_ASSISTANT_ID"),
    anthropic: opt("ANTHROPIC_API_KEY"),
    google: opt("GOOGLE_AI_API_KEY"),
    qwen: opt("QWEN_API_KEY"),
    grok: opt("GROK_API_KEY"),
    deepseek: opt("DEEPSEEK_API_KEY"),
    perplexity: opt("PERPLEXITY_API_KEY"),
    fal: opt("FAL_API_KEY"),
    replicate: opt("REPLICATE_API_KEY") ?? opt("REPLICATE_API_TOKEN"),
    runway: opt("RUNWAY_API_KEY"),
    luma: opt("LUMA_API_KEY"),
    elevenlabs: opt("ELEVENLABS_API_KEY"),
    heygen: opt("HEYGEN_API_KEY"),
    heygenAvatarId: opt("HEYGEN_AVATAR_ID"),
    did: opt("DID_API_KEY"),
    didPresenterUrl: opt("DID_PRESENTER_URL"),
  },
} as const;

export type Config = typeof config;
