/**
 * Voice-clone "return target" — Redis flag set by the webapp's
 * "Create voice" button inside the HeyGen video picker. After the bot
 * finishes cloning the voice, it reads this key and re-activates the
 * referenced video model so the user lands back where they started.
 *
 * Lives in Redis (not Prisma) because it's transient — only meaningful
 * between the button click and the next voice upload (a few minutes max).
 *
 * The TTL is intentionally short: any other voice-clone activation
 * (reply button in the bot or model-select in management) ALSO clears
 * the marker, but if the user simply walks away and comes back hours
 * later, we don't want a stale marker to silently bounce them into
 * HeyGen on an unrelated voice clone.
 */
export const VOICE_CLONE_RETURN_TTL_SECONDS = 15 * 60;

export type VoiceCloneReturnTarget = "heygen";

export function voiceCloneReturnRedisKey(userId: bigint | number | string): string {
  return `voice-clone-return:${userId.toString()}`;
}
