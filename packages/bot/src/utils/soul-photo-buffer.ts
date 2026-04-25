/**
 * Persistent buffer for collecting photos during Higgsfield Soul character creation.
 *
 * Reuses the mediaInputs storage under the pseudo model-id `soul_creation`,
 * slot `photos`. Values use the `tg:{kind}:{fileId}` format (same as other
 * media-input slots) — Telegram file_ids have no TTL, so the user can take
 * their time before submitting. S3 upload + download from Telegram is
 * deferred until the user taps "Create character".
 */

import { userStateService } from "@metabox/api/services";

export const SOUL_MAX_PHOTOS = 50;
export const SOUL_MIN_PHOTOS = 3;

export const SOUL_BUFFER_MODEL_ID = "soul_creation";
export const SOUL_BUFFER_SLOT_KEY = "photos";

/** Debounce state for media group replies (one reply per album). */
const replyDebounce = new Map<string, NodeJS.Timeout>();

async function readSoulFileIds(userId: bigint): Promise<string[]> {
  const slots = await userStateService.getMediaInputs(userId, SOUL_BUFFER_MODEL_ID);
  return slots[SOUL_BUFFER_SLOT_KEY] ?? [];
}

/**
 * Append a Telegram file entry to the Soul buffer.
 * `fileIdEntry` should be in `tg:{kind}:{fileId}` format.
 * Returns the new total count in the buffer.
 */
export async function addSoulPhoto(userId: bigint, fileIdEntry: string): Promise<number> {
  const current = await readSoulFileIds(userId);
  if (current.length >= SOUL_MAX_PHOTOS) return current.length;
  const updated = await userStateService.addMediaInput(
    userId,
    SOUL_BUFFER_MODEL_ID,
    SOUL_BUFFER_SLOT_KEY,
    fileIdEntry,
  );
  return (updated[SOUL_BUFFER_SLOT_KEY] ?? []).length;
}

export async function getSoulBuffer(userId: bigint): Promise<{ fileIds: string[] } | null> {
  const fileIds = await readSoulFileIds(userId);
  if (fileIds.length === 0) return null;
  return { fileIds };
}

export async function clearSoulBuffer(userId: bigint): Promise<{ fileIds: string[] } | null> {
  const fileIds = await readSoulFileIds(userId);
  await userStateService.clearMediaInputs(userId, SOUL_BUFFER_MODEL_ID);
  if (fileIds.length === 0) return null;
  return { fileIds };
}

/**
 * Debounce reply: fires `fn` once per user, 1 second after the last photo
 * arrives. All incoming photos — albums, singles, forwarded bursts mixing
 * groups and singles — collapse into one reply per user.
 */
export function debounceSoulReply(
  userId: bigint,
  _mediaGroupId: string | undefined,
  fn: () => Promise<void>,
): void {
  const key = String(userId);
  const existing = replyDebounce.get(key);
  if (existing) clearTimeout(existing);
  replyDebounce.set(
    key,
    setTimeout(() => {
      replyDebounce.delete(key);
      void fn();
    }, 1000),
  );
}
