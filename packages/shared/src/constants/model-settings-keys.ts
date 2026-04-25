/**
 * One-shot fields that leak into `modelSettings` today (HeyGen / D-ID video)
 * but logically belong to a single generation, not the user's per-model
 * configuration. Kept in a single place so every producer / consumer strips
 * them consistently:
 *
 * - `generation.service.ts` drops them before snapshotting `modelSettings`
 *   into `GenerationJob.inputData.modelSettings` (no leak into history).
 * - The gallery modal hides them from the settings list and skips them when
 *   the user taps "Apply settings".
 *
 * Longer-term these should migrate into the `mediaInputs` column proper.
 * Until then this set is the single source of truth.
 */
export const ONE_SHOT_SETTING_KEYS: ReadonlySet<string> = new Set([
  "avatar_photo_url",
  "avatar_photo_s3key",
  "voice_url",
  "voice_s3key",
  "talking_photo_id",
]);
