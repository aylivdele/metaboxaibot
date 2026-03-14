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

  /** AI providers (all optional — only needed for models you enable) */
  ai: {
    openai: opt("OPENAI_API_KEY"),
    openaiAssistantId: opt("OPENAI_ASSISTANT_ID"),
    anthropic: opt("ANTHROPIC_API_KEY"),
    google: opt("GOOGLE_AI_API_KEY"),
    qwen: opt("QWEN_API_KEY"),
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
