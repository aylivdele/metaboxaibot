import type { Section, MediaInputSlot, Translations } from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { getFileUrl } from "@metabox/api/services";

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

  for (const slot of slots) {
    const label = t.mediaInput[slot.labelKey as keyof typeof t.mediaInput] ?? slot.labelKey;
    const isFilled = !!filledInputs[slot.slotKey]?.length;

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
 * Resolves media input values: s3Keys (no `http` prefix) are converted to
 * presigned URLs via `getFileUrl`; existing URLs are passed through unchanged.
 * Called right before generation so presigned URLs are fresh.
 */
export async function resolveMediaInputUrls(
  inputs: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const resolved: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(inputs)) {
    resolved[key] = await Promise.all(
      values.map(async (v) => {
        if (v.startsWith("http")) return v;
        const url = await getFileUrl(v);
        return url ?? v; // fallback to raw value if resolution fails
      }),
    );
  }
  return resolved;
}
