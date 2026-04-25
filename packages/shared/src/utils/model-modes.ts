import type { AIModel, MediaInputSlot, ModelMode } from "../types/ai.js";

/**
 * Returns the explicit modes defined on a model, or `null` if the model has
 * a single implicit mode (no picker needed).
 *
 * A model is "single-mode" when:
 *  - it has no `modes` declared, AND
 *  - any combination of one required slot + optional siblings collapses into
 *    one logical operation (per product spec — see the design notes in
 *    plan: media slot modes).
 */
export function getResolvedModes(model: AIModel): ModelMode[] | null {
  if (!model.modes?.length) return null;
  return model.modes;
}

/** id of the default mode — explicit `default: true` wins, otherwise first. */
export function defaultModeId(modes: readonly ModelMode[]): string {
  const explicit = modes.find((m) => m.default);
  return (explicit ?? modes[0]).id;
}

/**
 * Resolve which mode is currently active given the user's saved selection.
 * Falls back to the model's default mode when the saved id is unknown
 * (e.g. mode was renamed or removed in a model update).
 */
export function resolveActiveMode(
  model: AIModel,
  selectedModeId: string | null | undefined,
): ModelMode | null {
  const modes = getResolvedModes(model);
  if (!modes) return null;
  const found = selectedModeId ? modes.find((m) => m.id === selectedModeId) : undefined;
  return found ?? modes.find((m) => m.id === defaultModeId(modes)) ?? modes[0];
}

/**
 * Filter the model's `mediaInputs` to only the slots active in the given mode.
 * For models without `modes`, returns all `mediaInputs` unchanged.
 *
 * When the active mode declares `requiredSlotKeys`, those override each
 * slot's intrinsic `required` flag — slots not listed become optional within
 * that mode, and slots listed become required even if `slot.required` is
 * false (lets the same slot be optional in one mode and required in another).
 */
export function getActiveSlots(
  model: AIModel,
  selectedModeId: string | null | undefined,
): MediaInputSlot[] {
  const all = model.mediaInputs ?? [];
  const mode = resolveActiveMode(model, selectedModeId);
  if (!mode) return [...all];
  if (mode.textOnly) return [];
  const allowed = new Set(mode.slotKeys);
  const requiredOverride = mode.requiredSlotKeys ? new Set(mode.requiredSlotKeys) : null;
  return all
    .filter((s) => allowed.has(s.slotKey))
    .map((s) => (requiredOverride ? { ...s, required: requiredOverride.has(s.slotKey) } : s));
}

/**
 * Check whether the user-saved mode id is still valid for this model.
 * Useful when a model was edited (mode removed/renamed) — caller can clear
 * stale selections from user state.
 */
export function isKnownModeId(model: AIModel, modeId: string | null | undefined): boolean {
  const modes = getResolvedModes(model);
  if (!modes) return modeId == null;
  if (!modeId) return false;
  return modes.some((m) => m.id === modeId);
}
