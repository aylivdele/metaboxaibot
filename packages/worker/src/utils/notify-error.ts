/**
 * Sends a structured error notification to the tech Telegram chat (ALERT_CHAT_ID).
 * Silently no-ops if ALERT_CHAT_ID is not configured.
 */

import { config } from "@metabox/shared";
import { Api } from "grammy";

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
