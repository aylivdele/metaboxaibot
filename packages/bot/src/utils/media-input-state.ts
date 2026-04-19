import type { Section, MediaInputSlot, Translations } from "@metabox/shared";
import { config, UserFacingError } from "@metabox/shared";
import { InlineKeyboard, InputFile } from "grammy";
import type { Context } from "grammy";
import { getFileUrl } from "@metabox/api/services";

/** Telegram Bot API hard limit for downloading files (cloud Bot API). */
export const TG_DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

export type TgFileKind = "photo" | "doc" | "video" | "audio" | "voice";

/** Slot value format for Telegram-uploaded media: resolved lazily at submit. */
export function buildTgSlotValue(kind: TgFileKind, fileId: string): string {
  return `tg:${kind}:${fileId}`;
}

async function tgGetFilePath(fileId: string): Promise<string> {
  const res = await fetch(
    `https://api.telegram.org/bot${config.bot.token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const data = (await res.json().catch(() => null)) as {
    ok: boolean;
    result?: { file_path?: string };
    description?: string;
  } | null;
  if (!res.ok || !data?.ok || !data.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${data?.description ?? `HTTP ${res.status}`}`);
  }
  return data.result.file_path;
}

export interface ActiveUploadSlot {
  slotKey: string;
  modelId: string;
  maxImages: number;
  section: Section;
}

const activeSlots = new Map<bigint, ActiveUploadSlot>();

export function setActiveSlot(userId: bigint, slot: ActiveUploadSlot): void {
  activeSlots.set(userId, slot);
}

export function getActiveSlot(userId: bigint): ActiveUploadSlot | undefined {
  return activeSlots.get(userId);
}

export function clearActiveSlot(userId: bigint): void {
  activeSlots.delete(userId);
}

/**
 * Builds an inline keyboard showing current media input slot status + a text line.
 * Filled slots: "✅ {label}" with remove callback.
 * Empty slots: "🖼 {label} (optional/required)" with upload callback.
 * If all required slots are filled (or none are required), appends readyForPrompt text.
 * When `promptOptional` is true and all required slots are filled, adds a "Start generation" button.
 */
export function buildMediaInputStatusMenu(
  slots: MediaInputSlot[],
  filledInputs: Record<string, string[]>,
  section: string,
  t: Translations,
  options?: { promptOptional?: boolean },
): { text: string; kb: InlineKeyboard } {
  const kb = new InlineKeyboard();

  let allRequiredFilled = true;
  let nextElementShown = false;

  // Determine which exclusive groups have filled slots.
  const filledGroups = new Set<string>();
  for (const slot of slots) {
    if (slot.exclusiveGroup && filledInputs[slot.slotKey]?.length) {
      filledGroups.add(slot.exclusiveGroup);
    }
  }

  for (const slot of slots) {
    const label = t.mediaInput[slot.labelKey as keyof typeof t.mediaInput] ?? slot.labelKey;
    const isFilled = !!filledInputs[slot.slotKey]?.length;

    // Hide slots from other exclusive groups when one group is active.
    if (
      slot.exclusiveGroup &&
      !isFilled &&
      filledGroups.size > 0 &&
      !filledGroups.has(slot.exclusiveGroup)
    ) {
      continue;
    }

    // Progressive reveal for element slots: show filled + one next empty slot.
    if (slot.mode === "reference_element") {
      if (isFilled) {
        kb.text(`✅ ${label}`, `mi:${section}:${slot.slotKey}`)
          .text(t.mediaInput.remove, `mi_remove:${section}:${slot.slotKey}`)
          .row();
      } else if (!nextElementShown) {
        nextElementShown = true;
        const suffix = slot.required ? ` ${t.mediaInput.required}` : ` ${t.mediaInput.optional}`;
        kb.text(`${label}${suffix}`, `mi:${section}:${slot.slotKey}`).row();
        if (slot.required) allRequiredFilled = false;
      }
      continue;
    }

    if (isFilled) {
      kb.text(`✅ ${label}`, `mi:${section}:${slot.slotKey}`)
        .text(t.mediaInput.remove, `mi_remove:${section}:${slot.slotKey}`)
        .row();
    } else {
      const suffix = slot.required ? ` ${t.mediaInput.required}` : ` ${t.mediaInput.optional}`;
      kb.text(`${label}${suffix}`, `mi:${section}:${slot.slotKey}`).row();
      if (slot.required) allRequiredFilled = false;
    }
  }

  const promptOptional = options?.promptOptional ?? false;

  if (allRequiredFilled && promptOptional) {
    kb.text(t.mediaInput.startGeneration, `mi_generate:${section}`).row();
  }

  const text = allRequiredFilled
    ? promptOptional
      ? t.mediaInput.readyForPromptOptional
      : t.mediaInput.readyForPrompt
    : "";
  return { text, kb };
}

/**
 * Debounce reply when receiving a media group into a slot.
 * Each photo in the group saves immediately, but the status reply is delayed.
 * Only the last callback (after no more photos arrive within 500ms) fires.
 * For non-group messages, the callback executes immediately.
 */
const slotReplyTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function debounceSlotReply(
  userId: bigint,
  mediaGroupId: string | undefined,
  callback: () => Promise<void>,
): void {
  if (!mediaGroupId) {
    void callback();
    return;
  }
  const key = `${userId}__${mediaGroupId}`;
  const existing = slotReplyTimers.get(key);
  if (existing) clearTimeout(existing);
  slotReplyTimers.set(
    key,
    setTimeout(() => {
      slotReplyTimers.delete(key);
      void callback();
    }, 500),
  );
}

/**
 * Resolves a single slot value to a fresh URL.
 *  - `tg:{kind}:{fileId}` → call Telegram getFile, build a fresh download URL
 *  - `http*`              → pass through
 *  - anything else        → treated as an S3 key, resolved via `getFileUrl`
 *
 * Throws `UserFacingError("mediaSlotExpired")` if a Telegram file_id can no
 * longer be downloaded (e.g. bot token rotated). This surfaces as a clear
 * message to the user instead of an opaque generation failure.
 */
async function resolveSlotValue(v: string): Promise<string> {
  if (v.startsWith("tg:")) {
    const idx = v.indexOf(":", 3);
    const fileId = idx === -1 ? v.slice(3) : v.slice(idx + 1);
    try {
      const filePath = await tgGetFilePath(fileId);
      return `https://api.telegram.org/file/bot${config.bot.token}/${filePath}`;
    } catch {
      throw new UserFacingError("Media slot expired", { key: "mediaSlotExpired" });
    }
  }
  if (v.startsWith("http")) return v;
  const url = await getFileUrl(v);
  return url ?? v;
}

/**
 * Resolves media input values right before generation so URLs are fresh.
 * See `resolveSlotValue` for per-value semantics.
 */
export async function resolveMediaInputUrls(
  inputs: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const resolved: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(inputs)) {
    resolved[key] = await Promise.all(values.map(resolveSlotValue));
  }
  return resolved;
}

/** Maps slot.mode to the default Telegram send method for legacy values without explicit kind. */
function inferKindFromSlotMode(mode: MediaInputSlot["mode"]): TgFileKind {
  if (mode === "reference_audio" || mode === "driving_audio") return "audio";
  if (mode === "reference_video" || mode === "motion_video" || mode === "first_clip")
    return "video";
  return "photo";
}

interface ResolvedSlotItem {
  kind: TgFileKind;
  source: string | InputFile;
}

async function resolveSlotItem(v: string, slot: MediaInputSlot): Promise<ResolvedSlotItem | null> {
  if (v.startsWith("tg:")) {
    const rest = v.slice(3);
    const idx = rest.indexOf(":");
    const parsedKind = (idx === -1 ? rest : rest.slice(0, idx)) as TgFileKind;
    const fileId = idx === -1 ? "" : rest.slice(idx + 1);
    if (!fileId) return null;
    return { kind: parsedKind, source: fileId };
  }
  const kind = inferKindFromSlotMode(slot.mode);
  const url = v.startsWith("http") ? v : ((await getFileUrl(v)) ?? null);
  if (!url) return null;
  return { kind, source: new InputFile({ url }) };
}

/** Telegram media-group bucket: photo+video can mix, audio/document own buckets, voice never groups. */
type GroupBucket = "photo_video" | "audio" | "document" | "single";
function bucketFor(kind: TgFileKind): GroupBucket {
  if (kind === "photo" || kind === "video") return "photo_video";
  if (kind === "audio") return "audio";
  if (kind === "doc") return "document";
  return "single"; // voice
}

async function sendSingle(ctx: Context, chatId: number, item: ResolvedSlotItem): Promise<void> {
  const { kind, source } = item;
  if (kind === "photo") await ctx.api.sendPhoto(chatId, source);
  else if (kind === "video") await ctx.api.sendVideo(chatId, source);
  else if (kind === "audio") await ctx.api.sendAudio(chatId, source);
  else if (kind === "voice") await ctx.api.sendVoice(chatId, source);
  else await ctx.api.sendDocument(chatId, source);
}

async function sendBucket(
  ctx: Context,
  chatId: number,
  bucket: GroupBucket,
  items: ResolvedSlotItem[],
): Promise<void> {
  if (items.length === 1 || bucket === "single") {
    for (const item of items) {
      try {
        await sendSingle(ctx, chatId, item);
      } catch {
        // skip unresendable item
      }
    }
    return;
  }
  // Telegram media groups accept 2-10 items; chunk if needed.
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    if (chunk.length === 1) {
      try {
        await sendSingle(ctx, chatId, chunk[0]);
      } catch {
        /* skip */
      }
      continue;
    }
    try {
      if (bucket === "photo_video") {
        await ctx.api.sendMediaGroup(
          chatId,
          chunk.map((it) =>
            it.kind === "video"
              ? { type: "video", media: it.source }
              : { type: "photo", media: it.source },
          ),
        );
      } else if (bucket === "audio") {
        await ctx.api.sendMediaGroup(
          chatId,
          chunk.map((it) => ({ type: "audio", media: it.source })),
        );
      } else {
        await ctx.api.sendMediaGroup(
          chatId,
          chunk.map((it) => ({ type: "document", media: it.source })),
        );
      }
    } catch {
      // Fallback: send individually if media group failed (e.g. mixed legacy URLs).
      for (const item of chunk) {
        try {
          await sendSingle(ctx, chatId, item);
        } catch {
          /* skip */
        }
      }
    }
  }
}

/**
 * Sends slot contents back to the chat as a preview when the user taps a filled slot.
 * For `tg:{kind}:{fileId}` values uses file_id directly (no download). For legacy
 * URL/s3Key values, resolves to a URL and sends by InputFile.
 * Multiple compatible items (photos/videos, audio, documents) are batched into
 * a Telegram media group; voice messages are always sent individually.
 */
export async function sendSlotPreview(
  ctx: Context,
  slot: MediaInputSlot,
  values: string[],
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Resolve all items, then group consecutive compatible items into buckets.
  const resolved: ResolvedSlotItem[] = [];
  for (const v of values) {
    const item = await resolveSlotItem(v, slot);
    if (item) resolved.push(item);
  }
  if (!resolved.length) return;

  let currentBucket = bucketFor(resolved[0].kind);
  let currentChunk: ResolvedSlotItem[] = [];
  for (const item of resolved) {
    const b = bucketFor(item.kind);
    if (b !== currentBucket) {
      await sendBucket(ctx, chatId, currentBucket, currentChunk);
      currentChunk = [];
      currentBucket = b;
    }
    currentChunk.push(item);
  }
  if (currentChunk.length) await sendBucket(ctx, chatId, currentBucket, currentChunk);
}
