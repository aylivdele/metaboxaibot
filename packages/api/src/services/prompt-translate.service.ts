import OpenAI from "openai";
import { AI_MODELS, config } from "@metabox/shared";
import { calculateCost, deductTokens } from "./token.service.js";
import { logger } from "../logger.js";

const TRANSLATE_MODEL_ID = "gpt-5-nano";
const SYSTEM_PROMPT =
  "You are a translator. Translate the user message into natural, concise English. " +
  "Preserve meaning, tone, named entities, numbers, and any technical terms. " +
  "Respond with ONLY the translated text — no commentary, no quotes.";

/**
 * Returns true when the prompt already looks like English (or is purely
 * numeric / punctuation / emoji). We check that every "letter" codepoint
 * falls within the Basic Latin range (A-Z, a-z). Non-letter characters
 * (digits, punctuation, whitespace, emoji) are ignored — they are
 * language-neutral and shouldn't force a translation call.
 */
function looksEnglish(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // Skip ASCII non-letters, whitespace, and characters outside BMP letter
    // ranges (emoji, symbols, etc.) — only test actual letter codepoints.
    if (cp < 0x41) continue; // before 'A'
    if (cp <= 0x5a) continue; // A-Z
    if (cp < 0x61) continue; // between 'Z' and 'a' (punctuation)
    if (cp <= 0x7a) continue; // a-z
    if (cp < 0x80) continue; // remaining ASCII (DEL, etc.)
    // Any non-ASCII letter (Cyrillic, CJK, Arabic, etc.) → not English
    return false;
  }
  return true;
}

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: config.ai.openai });
  return cachedClient;
}

/**
 * If `modelSettings.auto_translate_prompt === true`, translates `prompt` to English
 * via `gpt-5-nano` and deducts the actual token-based cost from `userId`.
 * Returns the translated text on success, or the original prompt on any failure
 * (translation errors are swallowed so the primary generation still runs).
 *
 * Safe to call from both API services and worker processors.
 */
export async function translatePromptIfNeeded(
  prompt: string,
  modelSettings: Record<string, unknown> | undefined,
  userId: bigint,
): Promise<string> {
  if (!modelSettings || modelSettings.auto_translate_prompt !== true) return prompt;
  if (looksEnglish(prompt)) return prompt;

  const model = AI_MODELS[TRANSLATE_MODEL_ID];
  if (!model) {
    logger.error({ TRANSLATE_MODEL_ID }, "Translator model missing from AI_MODELS");
    return prompt;
  }

  try {
    const client = getClient();
    const response = await (
      client.responses.create as (p: unknown) => Promise<OpenAI.Responses.Response>
    )({
      model: TRANSLATE_MODEL_ID,
      instructions: SYSTEM_PROMPT,
      input: prompt,
    });

    const translated = response.output_text?.trim();
    if (!translated) throw new Error("empty translation");

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const cost = calculateCost(model, inputTokens, outputTokens);
    if (cost > 0) {
      await deductTokens(userId, cost, TRANSLATE_MODEL_ID).catch((err) => {
        logger.warn({ err, userId: userId.toString() }, "Failed to deduct translation cost");
      });
    }

    return translated;
  } catch (err) {
    logger.warn({ err }, "Auto-translate failed, falling back to original prompt");
    return prompt;
  }
}
