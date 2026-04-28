/**
 * Canonical @-reference syntax for video generation prompts.
 *
 * User-facing canonical forms:
 *   @Element1..@ElementN  — references kling_elements / ref_element_N slots
 *   @Image1..@ImageN      — references ref_images slot entries
 *   @Video                — references a single uploaded reference video
 *
 * Adapters translate from canonical to their provider-specific format.
 * Users always write the canonical form; the bot normalises case variants silently.
 */

/** Extracts @word tokens that are NOT preceded by a word character (avoids email addresses). */
export const AT_TOKEN_RE = /(?<!\w)@([A-Za-z_]\w*)/g;

// ── Provider-specific output patterns (used by translators) ──────────────────

/** Matches any @ElementN or @elementN (case-insensitive) for translation. */
export const ELEMENT_CI_RE = /(?<!\w)@[Ee]lement(\d+)/g;
/** Matches any @ImageN or @imageN (case-insensitive) for translation. */
export const IMAGE_CI_RE = /(?<!\w)@[Ii]mage(\d+)/g;
/** Matches @Video or @video (case-insensitive, no trailing number) for translation. */
export const VIDEO_CI_RE = /(?<!\w)@[Vv]ideo\b(?!\d)/g;

// ── Capabilities type (embedded in AIModel.promptRefs) ───────────────────────

/**
 * Declares what kinds of @-references a model supports in its prompt.
 * Used by the pre-flight validator to catch bad references before API submission.
 */
export interface PromptRefCapabilities {
  /** @Element1..@ElementN refs → ref_element_N media slots. */
  elements?: { max: number };
  /** @Image1..@ImageN refs → ref_images media slot array. */
  images?: { max: number };
  /** @Video ref → motion_video or ref_videos slot. */
  video?: boolean;
}
