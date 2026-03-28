import { logger } from "../logger.js";

/** Recursively truncate strings longer than `maxLen` characters. */
export function truncateStrings(value: unknown, maxLen = 20): unknown {
  if (typeof value === "string") {
    return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateStrings(item, maxLen));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        truncateStrings(v, maxLen),
      ]),
    );
  }
  return value;
}

/**
 * Drop-in replacement for `fetch` that logs the URL, HTTP method, and request
 * body at debug level before each call.
 *
 * Body logging:
 *  - JSON string  → parsed, strings > 20 chars truncated, logged as object
 *  - Other string → logged as `<string N chars>`
 *  - ArrayBuffer / TypedArray → logged as `<binary N bytes>`
 *  - null / undefined → not logged
 */
export function fetchWithLog(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (logger.isLevelEnabled("debug")) {
    const method = init?.method ?? "GET";
    const urlStr = url instanceof Request ? url.url : String(url);
    const body = init?.body;

    let bodyLog: unknown;
    if (body == null) {
      // no body — omit from log
    } else if (typeof body === "string") {
      try {
        bodyLog = truncateStrings(JSON.parse(body));
      } catch {
        bodyLog = `<string ${body.length} chars>`;
      }
    } else if (body instanceof ArrayBuffer) {
      bodyLog = `<binary ${body.byteLength} bytes>`;
    } else if (ArrayBuffer.isView(body)) {
      bodyLog = `<binary ${(body as ArrayBufferView).byteLength} bytes>`;
    } else {
      bodyLog = "<body>";
    }

    logger.debug({ method, url: urlStr, ...(bodyLog !== undefined && { body: bodyLog }) }, "fetch");
  }

  return fetch(url as Parameters<typeof fetch>[0], init);
}

/**
 * Log an SDK call at debug level: model, action, and params (strings > 20 chars truncated).
 */
export function logCall(model: string, action: string, params: Record<string, unknown>): void {
  if (logger.isLevelEnabled("debug")) {
    logger.debug(
      { model, action, params: truncateStrings(params) as Record<string, unknown> },
      "sdk-call",
    );
  }
}
