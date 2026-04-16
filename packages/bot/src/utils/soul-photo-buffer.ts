/**
 * In-memory buffer for collecting photos during Higgsfield Soul character creation.
 * Lost on bot restart — acceptable, user simply starts the process over.
 */

export const SOUL_MAX_PHOTOS = 50;
export const SOUL_MIN_PHOTOS = 3;

export interface SoulPhotoBuffer {
  s3Keys: string[];
  telegramChatId: number;
}

const buffers = new Map<bigint, SoulPhotoBuffer>();

/** Debounce state for media group replies (one reply per album). */
const replyDebounce = new Map<string, NodeJS.Timeout>();

export function initSoulBuffer(userId: bigint, telegramChatId: number): void {
  buffers.set(userId, { s3Keys: [], telegramChatId });
}

export function getSoulBuffer(userId: bigint): SoulPhotoBuffer | undefined {
  return buffers.get(userId);
}

/** Add a photo S3 key to the buffer. Returns updated count. */
export function addSoulPhoto(userId: bigint, s3Key: string): number {
  const buf = buffers.get(userId);
  if (!buf) return 0;
  if (buf.s3Keys.length < SOUL_MAX_PHOTOS) {
    buf.s3Keys.push(s3Key);
  }
  return buf.s3Keys.length;
}

/** Remove and return the buffer. Returns undefined if none exists. */
export function clearSoulBuffer(userId: bigint): SoulPhotoBuffer | undefined {
  const buf = buffers.get(userId);
  buffers.delete(userId);
  return buf;
}

/**
 * Debounce reply for media group: only fires `fn` once per group,
 * 1 second after the last photo in the group arrives.
 * For non-group messages, fires immediately.
 */
export function debounceSoulReply(
  userId: bigint,
  mediaGroupId: string | undefined,
  fn: () => Promise<void>,
): void {
  if (!mediaGroupId) {
    void fn();
    return;
  }
  const key = `${userId}__${mediaGroupId}`;
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
