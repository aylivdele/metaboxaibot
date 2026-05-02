/**
 * Серверная валидация email — синтаксис + MX-запись домена.
 *
 * Поймает: несуществующие домены [`yandex.rru`, `gmial.cmm`], опечатки
 * выходящие за пределы реальных DNS-зон.
 *
 * НЕ поймает: опечатки внутри существующих доменов [`gmail.co` —
 * валидный домен Колумбии с MX-записями]. Для них служит подсказка
 * на фронте через `suggestEmailTypo` из @metabox/shared-browser.
 *
 * Кеш: in-memory, TTL 1 час. Без него подряд идущие регистрации с
 * одного домена будут долбить DNS зря.
 */
import { resolveMx } from "node:dns/promises";
import { logger } from "../logger.js";

const MX_TTL_MS = 60 * 60 * 1000; // 1 час
const mxCache = new Map<string, { ok: boolean; ts: number }>();

const SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: "syntax" | "mx" };

async function hasMxRecord(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.ts < MX_TTL_MS) return cached.ok;

  try {
    const records = await resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    mxCache.set(domain, { ok, ts: Date.now() });
    return ok;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOTFOUND" && code !== "ENODATA") {
      logger.warn({ domain, code, err }, "[email-validation] MX resolve unexpected error");
    }
    mxCache.set(domain, { ok: false, ts: Date.now() });
    return false;
  }
}

/**
 * Полная серверная валидация: синтаксис → MX. Возвращает
 * нормализованный email при успехе (lowercase + trim).
 */
export async function validateEmail(email: unknown): Promise<EmailValidationResult> {
  if (typeof email !== "string") return { ok: false, reason: "syntax" };
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 255) return { ok: false, reason: "syntax" };
  if (!SYNTAX_RE.test(normalized)) return { ok: false, reason: "syntax" };

  const at = normalized.lastIndexOf("@");
  const domain = normalized.slice(at + 1);
  if (!(await hasMxRecord(domain))) return { ok: false, reason: "mx" };

  return { ok: true, normalized };
}
