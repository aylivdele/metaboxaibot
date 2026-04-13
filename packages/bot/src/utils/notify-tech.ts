/**
 * Sends a structured error notification to the tech Telegram chat (ALERT_CHAT_ID).
 * Mirrors the worker's notify-error utility but uses the bot's own Api instance.
 * Silently no-ops if ALERT_CHAT_ID is not configured or sending fails.
 */

import { Api } from "grammy";
import { config } from "@metabox/shared";

const telegram = new Api(config.bot.token);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeError(err: unknown): string {
  if (err === null || err === undefined) return String(err);

  const parts: string[] = [];

  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") parts.push(e.message);
    if (typeof e.status === "number" || typeof e.statusCode === "number") {
      parts.push(`HTTP ${e.status ?? e.statusCode}`);
    }
    if (e.body !== undefined) {
      try {
        parts.push("body: " + JSON.stringify(e.body, null, 2));
      } catch {
        parts.push("body: [unserializable]");
      }
    }
    if (typeof e.stack === "string") {
      const stackLines = e.stack.split("\n").slice(0, 6).join("\n");
      parts.push(stackLines);
    }
    if (e.cause !== undefined) {
      parts.push("caused by: " + serializeError(e.cause));
    }
  } else {
    parts.push(String(err));
  }

  return parts.join("\n");
}

export interface TechErrorContext {
  section?: string;
  modelId?: string;
  userId?: string;
  dialogId?: string;
}

/**
 * Sends a tech error alert to ALERT_CHAT_ID. Does not throw — always resolves.
 */
export async function notifyTechError(err: unknown, ctx: TechErrorContext): Promise<void> {
  const chatId = config.alerts.chatId;
  if (!chatId) return;

  const threadId = config.alerts.threadId;

  const label = [ctx.section, ctx.modelId].filter(Boolean).join("/") || "gpt";
  const header = `🔴 <b>Chat error</b> [${label}]`;

  const meta: string[] = [];
  if (ctx.dialogId) meta.push(`dialog: <code>${ctx.dialogId}</code>`);
  if (ctx.userId) meta.push(`user: <code>${ctx.userId}</code>`);

  const errorText = serializeError(err);
  const maxErrorLen = 3500 - header.length - meta.join(" | ").length;
  const truncated =
    errorText.length > maxErrorLen ? errorText.slice(0, maxErrorLen) + "\n…[truncated]" : errorText;

  const text = [header, meta.length ? meta.join(" | ") : null, `<pre>${escapeHtml(truncated)}</pre>`]
    .filter(Boolean)
    .join("\n");

  await telegram
    .sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
    .catch(() => void 0);
}
