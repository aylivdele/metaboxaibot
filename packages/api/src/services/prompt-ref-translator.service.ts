import { ELEMENT_CI_RE, IMAGE_CI_RE, VIDEO_CI_RE } from "@metabox/shared";

export type RefDialect = "fal" | "kie" | "evolink";

/**
 * Context for translating canonical @-refs to a specific provider dialect.
 *
 * For "evolink" the positional maps are required: evolink uses `<<<image_N>>>`
 * syntax where N is the 1-based position of the image in the `image_urls` array.
 * Because element slots can have gaps (slot 1 and slot 3 filled, slot 2 empty),
 * the map encodes the correct array position per slot index so that
 * @Element3 → <<<image_2>>> when slot 2 was empty and slot 3 is at array pos 2.
 *
 * The maps are built by the adapter just before calling translatePromptRefs,
 * using the same ordering logic as the image_urls array construction.
 */
export interface TranslateRefContext {
  dialect: RefDialect;
  /**
   * For "evolink": slot index (1-based) → 1-based position in image_urls.
   * Example: slots 1 and 3 filled → Map { 1 → 1, 3 → 2 }
   */
  elementPositions?: Map<number, number>;
  /**
   * For "evolink": 1-based image index → 1-based position in image_urls.
   * Used when the model passes ref_images alongside elements.
   */
  imagePositions?: Map<number, number>;
}

/**
 * Translates canonical @Element1/@Image1/@Video references in a prompt to the
 * provider-specific syntax required by the given dialect.
 *
 * Also normalises case variants (@element1, @IMAGE2) that slipped past the
 * validator (e.g. from saved prompts) so providers receive exactly what they
 * expect.
 *
 * Dialects:
 *   "fal"     — @ElementN (Capital), @ImageN (Capital), @Video unchanged.
 *   "kie"     — @elementN (lowercase), @imageN (lowercase), @Video unchanged.
 *   "evolink" — @ElementN → <<<image_P>>> where P = elementPositions.get(N).
 *               Refs without a position entry (slot not in the array) are
 *               left as-is so the prompt remains readable even if something
 *               is misconfigured.
 */
export function translatePromptRefs(prompt: string, ctx: TranslateRefContext): string {
  const { dialect } = ctx;
  let result = prompt;

  if (dialect === "fal") {
    result = result.replace(
      new RegExp(ELEMENT_CI_RE.source, ELEMENT_CI_RE.flags),
      (_, idx) => `@Element${idx}`,
    );
    result = result.replace(
      new RegExp(IMAGE_CI_RE.source, IMAGE_CI_RE.flags),
      (_, idx) => `@Image${idx}`,
    );
    result = result.replace(new RegExp(VIDEO_CI_RE.source, VIDEO_CI_RE.flags), "@Video");
    return result;
  }

  if (dialect === "kie") {
    result = result.replace(
      new RegExp(ELEMENT_CI_RE.source, ELEMENT_CI_RE.flags),
      (_, idx) => `@element${idx}`,
    );
    result = result.replace(
      new RegExp(IMAGE_CI_RE.source, IMAGE_CI_RE.flags),
      (_, idx) => `@image${idx}`,
    );
    // @Video is not used in kie prompts (video handled via video_urls slot, not prompt refs)
    return result;
  }

  if (dialect === "evolink") {
    const elemPositions = ctx.elementPositions;
    result = result.replace(
      new RegExp(ELEMENT_CI_RE.source, ELEMENT_CI_RE.flags),
      (match, idxStr) => {
        const slotIdx = Number(idxStr);
        const arrayPos = elemPositions?.get(slotIdx);
        if (arrayPos === undefined) return match;
        return `<<<image_${arrayPos}>>>`;
      },
    );

    const imgPositions = ctx.imagePositions;
    result = result.replace(new RegExp(IMAGE_CI_RE.source, IMAGE_CI_RE.flags), (match, idxStr) => {
      const imgIdx = Number(idxStr);
      const arrayPos = imgPositions?.get(imgIdx);
      if (arrayPos === undefined) return match;
      return `<<<image_${arrayPos}>>>`;
    });

    return result;
  }

  return result;
}

/**
 * Builds the element slot → array position map for evolink from the filled
 * ref_element_* keys in mediaInputs.
 *
 * Example: ref_element_1 and ref_element_3 filled →
 *   Map { 1 → 1, 3 → 2 }
 *
 * This ensures @Element3 maps to <<<image_2>>> when slot 2 is absent,
 * matching the order in which the adapter builds image_urls.
 */
export function buildEvolinkElementPositions(
  mediaInputs: Record<string, string[]>,
): Map<number, number> {
  const map = new Map<number, number>();
  let pos = 1;
  for (let i = 1; i <= 3; i++) {
    if (mediaInputs[`ref_element_${i}`]?.[0]) {
      map.set(i, pos++);
    }
  }
  return map;
}
