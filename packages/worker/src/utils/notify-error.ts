/**
 * Sends a structured error notification to the tech Telegram chat (ALERT_CHAT_ID).
 * Silently no-ops if ALERT_CHAT_ID is not configured.
 */

import { config } from "@metabox/shared";
import { Api } from "grammy";
import { getRedis } from "@metabox/api/redis";

const telegram = new Api(config.bot.token);

export interface ErrorContext {
  /** BullMQ job ID or DB job ID */
  jobId?: string;
  /** Model/provider ID (e.g. "flux-pro", "kling") */
  modelId?: string;
  /** Section: image, video, audio, avatar */
  section?: string;
  /** Internal user ID */
  userId?: string;
  /** Number of attempts made so far */
  attempt?: number;
}

/**
 * Serializes an error into a full diagnostic string, including nested cause chain,
 * structured fal error detail, and stack trace.
 *
 * Specifically для undici-style ошибок: `TypeError: fetch failed` несёт
 * реальную причину в `cause` (с полем `code` типа "ECONNRESET"). Walk'аем
 * cause-chain, на каждом уровне выводим code/errno/syscall/address если есть —
 * без этого alert получается бесполезным "fetch failed".
 */
function serializeError(err: unknown): string {
  if (err === null || err === undefined) return String(err);

  const parts: string[] = [];

  if (typeof err === "object") {
    const e = err as Record<string, unknown>;

    // Standard Error fields
    if (typeof e.message === "string") parts.push(e.message);
    if (typeof e.status === "number" || typeof e.statusCode === "number") {
      parts.push(`HTTP ${e.status ?? e.statusCode}`);
    }

    // Network-уровень: code/errno/syscall/host (undici, libuv, dns).
    const code = e.code ?? e.errno;
    if (typeof code === "string" || typeof code === "number") {
      parts.push(`code: ${code}`);
    }
    if (typeof e.syscall === "string") parts.push(`syscall: ${e.syscall}`);
    if (typeof e.address === "string") parts.push(`address: ${e.address}`);
    if (typeof e.hostname === "string") parts.push(`hostname: ${e.hostname}`);
    if (typeof e.port === "number") parts.push(`port: ${e.port}`);

    // fal structured body
    if (e.body !== undefined) {
      try {
        parts.push("body: " + JSON.stringify(e.body, null, 2));
      } catch {
        parts.push("body: [unserializable]");
      }
    }

    // Stack trace
    if (typeof e.stack === "string") {
      // Only the first 5 lines of the stack to keep the message readable
      const stackLines = e.stack.split("\n").slice(0, 6).join("\n");
      parts.push(stackLines);
    }

    // Cause chain
    if (e.cause !== undefined) {
      parts.push("caused by: " + serializeError(e.cause));
    }
  } else {
    parts.push(String(err));
  }

  return parts.join("\n");
}

/**
 * Sends a tech error alert to ALERT_CHAT_ID.
 * Does not throw — always resolves.
 */
export async function notifyTechError(err: unknown, ctx: ErrorContext): Promise<void> {
  const chatId = config.alerts.chatId;
  if (!chatId) return;

  const threadId = config.alerts.threadId;

  const label = [ctx.section, ctx.modelId].filter(Boolean).join("/") || "unknown";
  const header = `🔴 <b>Job error</b> [${label}]`;

  const meta: string[] = [];
  if (ctx.jobId) meta.push(`job: <code>${ctx.jobId}</code>`);
  if (ctx.userId) meta.push(`user: <code>${ctx.userId}</code>`);
  if (ctx.attempt !== undefined) meta.push(`attempt: ${ctx.attempt}`);

  const errorText = serializeError(err);
  // Telegram HTML message cap is 4096 chars — truncate the error body if needed
  const maxErrorLen = 3500 - header.length - meta.join(" | ").length;
  const truncated =
    errorText.length > maxErrorLen ? errorText.slice(0, maxErrorLen) + "\n…[truncated]" : errorText;

  const text = [
    header,
    meta.length ? meta.join(" | ") : null,
    `<pre>${escapeHtml(truncated)}</pre>`,
  ]
    .filter(Boolean)
    .join("\n");

  await telegram
    .sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
    .catch(() => void 0); // never let alerting break the worker flow
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface RateLimitNotificationContext {
  section?: string;
  modelId: string;
  cooldownMs: number;
  reason: string;
  isLongWindow: boolean;
}

/**
 * Sends a rate-limit / throttle notification to ALERT_CHAT_ID. Distinct from
 * `notifyTechError` so the on-call thread can be filtered visually.
 * Does not throw — always resolves.
 */
export async function notifyRateLimit(ctx: RateLimitNotificationContext): Promise<void> {
  const chatId = config.alerts.chatId;
  if (!chatId) return;

  const threadId = config.alerts.threadId;

  const icon = ctx.isLongWindow ? "⛔" : "⏳";
  const kind = ctx.isLongWindow ? "Long-window quota" : "Rate limit";
  const label = [ctx.section, ctx.modelId].filter(Boolean).join("/") || ctx.modelId;
  const header = `${icon} <b>${kind}</b> [${label}]`;

  const cooldownLabel =
    ctx.cooldownMs >= 60_000
      ? `${Math.round(ctx.cooldownMs / 60_000)}m`
      : `${Math.round(ctx.cooldownMs / 1000)}s`;

  const text = [
    header,
    `cooldown: <code>${cooldownLabel}</code>`,
    `<pre>${escapeHtml(ctx.reason.slice(0, 1500))}</pre>`,
  ].join("\n");

  await telegram
    .sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
    .catch(() => void 0);
}

export interface FallbackNotificationContext {
  /** "image" | "video" */
  section: string;
  /** Common modelId (primary == fallback id by construction). */
  modelId: string;
  /** Provider строка primary модели. */
  primaryProvider: string;
  /** Provider строка модели на которую переключились (или null если все упали). */
  fallbackProvider: string | null;
  /** Причина переключения. */
  reason:
    | "pool_exhausted"
    | "long_window_rate_limit"
    | "persistent_5xx"
    | "provider_long_cooldown_marker"
    | "all_candidates_failed";
  /** GenerationJob.id для трассировки. */
  jobId?: string;
  /** Internal user ID, если доступен. */
  userId?: string;
}

const FALLBACK_ALERT_TTL_MS = 5 * 60 * 1000;

/**
 * Алерт в технический tg-канал о факте fallback'а. Дедуплицируется через
 * Redis SETNX (TTL 5 мин) по ключу `alert:fallback:<primary>:<fallback>` —
 * первый fallback за окно отправляется, последующие в том же окне пишутся
 * только в лог.
 *
 * Для случая `fallbackProvider === null` (все кандидаты упали) — отдельный
 * ключ `alert:fallback:<primary>:NONE`.
 */
export async function notifyFallback(ctx: FallbackNotificationContext): Promise<void> {
  const chatId = config.alerts.chatId;
  if (!chatId) return;

  const fbLabel = ctx.fallbackProvider ?? "NONE";
  // Включаем modelId в ключ — иначе разные модели одного провайдера маскируют
  // алерты друг друга (flux-2 fal→kie за минуту до seedream-5 fal→kie скрыл бы
  // второй алерт).
  const dedupeKey = `alert:fallback:${ctx.modelId}:${ctx.primaryProvider}:${fbLabel}`;
  const redis = getRedis();
  const setResult = await redis
    .set(dedupeKey, ctx.reason, "PX", FALLBACK_ALERT_TTL_MS, "NX")
    .catch(() => null);
  if (setResult !== "OK") return; // дубликат за окно — не шлём

  const threadId = config.alerts.threadId;
  const allFailed = ctx.fallbackProvider === null;
  const header = allFailed
    ? `❌ <b>Fallback FAILED</b> [${ctx.section}/${ctx.modelId}]`
    : `🔁 <b>Fallback</b> [${ctx.section}/${ctx.modelId}]`;

  const lines: string[] = [header];
  if (allFailed) {
    lines.push(`all candidates exhausted (primary: <code>${ctx.primaryProvider}</code>)`);
  } else {
    lines.push(`<code>${ctx.primaryProvider}</code> → <code>${ctx.fallbackProvider}</code>`);
  }
  lines.push(`reason: <code>${ctx.reason}</code>`);

  const meta: string[] = [];
  if (ctx.jobId) meta.push(`job: <code>${ctx.jobId}</code>`);
  if (ctx.userId) meta.push(`user: <code>${ctx.userId}</code>`);
  if (meta.length) lines.push(meta.join(" | "));

  await telegram
    .sendMessage(chatId, lines.join("\n"), {
      parse_mode: "HTML",
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
    .catch(() => void 0);
}
