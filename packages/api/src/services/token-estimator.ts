import { getEncoding, type Tiktoken } from "js-tiktoken";
import { logger } from "../logger.js";

let cachedEncoder: Tiktoken | null = null;
let initFailed = false;

function getEncoder(): Tiktoken | null {
  if (cachedEncoder) return cachedEncoder;
  if (initFailed) return null;
  try {
    cachedEncoder = getEncoding("cl100k_base");
    return cachedEncoder;
  } catch (err) {
    initFailed = true;
    logger.warn({ err }, "tiktoken init failed, falling back to chars/4");
    return null;
  }
}

/**
 * Estimate token count for a string. Uses tiktoken cl100k_base when available
 * (fast, local, no rate limits) and falls back to `chars/4` heuristic if the
 * encoder cannot be initialised. Always returns a non-negative integer; never
 * throws.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch (err) {
      logger.debug({ err }, "tiktoken encode failed, using fallback for this call");
    }
  }
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a single chat message including the per-message
 * structural overhead (role tag, separators) — ~4 tokens, matching OpenAI's
 * documented chat-completion accounting.
 */
export function estimateMessageTokens(content: string): number {
  return estimateTokens(content) + 4;
}
