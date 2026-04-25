import OpenAI, { type ClientOptions as OpenAIClientOptions } from "openai";
import { logger } from "../logger.js";
import { acquireKey, recordSuccess, recordError, markRateLimited } from "./key-pool.service.js";
import { isPoolExhaustedError } from "../utils/pool-exhausted-error.js";
import { classifyRateLimit } from "../utils/rate-limit-error.js";
import { buildProxyFetch } from "../ai/transport/proxy-fetch.js";

const CLASSIFIER_MODEL_ID = "gpt-5-nano";

const SYSTEM_PROMPT = `You triage opaque error messages from third-party AI generation providers (image, video, audio APIs).
Decide whether the error is something the END USER should see and act on (a "user-facing" error), or whether it is a technical fault that should be hidden from the user (a backend/infra issue).

User-facing errors are usually:
- Content policy / moderation refusals (nudity, violence, copyright, sensitive content, prohibited prompts)
- Validation errors caused by user input (unsupported aspect ratio, image too small/large, bad URL)
- Provider-side "inappropriate", "blocked", "rejected" content notices

NOT user-facing (hidden):
- Generic 500/502/503 server errors
- Timeouts, network errors, "service unavailable", "try again later"
- Auth/configuration problems (invalid key, account suspended)
- Api quota/credit exhaustion (e.g. not enough credits)
- Empty/unknown failure with no actionable hint

Respond with JSON of shape:
{ "shouldShow": boolean, "messageRu": string, "messageEn": string }

When shouldShow is true:
- "messageRu" — short, friendly Russian sentence (1–2 sentences) explaining the problem and what the user can do (rephrase, change settings, smaller image, etc.). Don't mention the provider's name or technical codes.
- "messageEn" — same in English.

When shouldShow is false, set both message fields to an empty string.

Output ONLY the JSON object — no markdown fences, no commentary.`;

interface ClassifierResult {
  shouldShow: boolean;
  messageRu: string;
  messageEn: string;
}

const MAX_INPUT_LENGTH = 800;
const cache = new Map<string, Promise<ClassifierResult | null>>();
const CACHE_LIMIT = 256;

/**
 * Classifies an opaque provider error using gpt-5-nano. Returns localized
 * ru/en messages when the error is user-facing, or null when it should be
 * hidden (or classification failed). Results cached in-memory by exact input.
 */
export async function classifyAIError(rawMessage: string): Promise<ClassifierResult | null> {
  const trimmed = rawMessage.trim().slice(0, MAX_INPUT_LENGTH);
  if (!trimmed) return null;

  const cached = cache.get(trimmed);
  if (cached) return cached;

  if (cache.size >= CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }

  const promise = runClassifier(trimmed);
  cache.set(trimmed, promise);
  return promise;
}

async function runClassifier(rawMessage: string): Promise<ClassifierResult | null> {
  let acquired;
  try {
    acquired = await acquireKey("openai");
  } catch (err) {
    if (isPoolExhaustedError(err)) {
      logger.warn({ err }, "AI error classifier skipped: OpenAI pool exhausted");
      return null;
    }
    throw err;
  }

  try {
    const fetchFn = buildProxyFetch(acquired.proxy) ?? undefined;
    const client = new OpenAI({
      apiKey: acquired.apiKey,
      ...(fetchFn ? { fetch: fetchFn as unknown as OpenAIClientOptions["fetch"] } : {}),
    });

    const response = await (
      client.responses.create as (p: unknown) => Promise<OpenAI.Responses.Response>
    )({
      model: CLASSIFIER_MODEL_ID,
      instructions: SYSTEM_PROMPT,
      input: rawMessage,
    });

    if (acquired.keyId) void recordSuccess(acquired.keyId);

    const text = response.output_text?.trim();
    if (!text) return null;

    const parsed = parseJsonObject(text);
    if (!parsed) return null;

    if (typeof parsed.shouldShow !== "boolean") return null;
    if (!parsed.shouldShow) return { shouldShow: false, messageRu: "", messageEn: "" };

    const messageRu = typeof parsed.messageRu === "string" ? parsed.messageRu.trim() : "";
    const messageEn = typeof parsed.messageEn === "string" ? parsed.messageEn.trim() : "";
    if (!messageRu || !messageEn) return null;

    return { shouldShow: true, messageRu, messageEn };
  } catch (err) {
    if (acquired.keyId) {
      const cls = classifyRateLimit(err, "openai");
      if (cls.isRateLimit) {
        void markRateLimited(acquired.keyId, cls.cooldownMs, cls.reason);
      } else {
        void recordError(acquired.keyId, err instanceof Error ? err.message : String(err));
      }
    }
    logger.warn({ err }, "AI error classifier failed");
    return null;
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  // Strip optional ```json fences just in case the model adds them.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
