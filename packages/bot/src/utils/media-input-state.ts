import type { Section, MediaInputSlot, Translations } from "@metabox/shared";
import { config, UserFacingError } from "@metabox/shared";
import { InlineKeyboard } from "grammy";
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
