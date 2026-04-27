import { describe, test, expect } from "vitest";
import type { AIModel, MediaInputSlot } from "../../types/ai.js";
import { isFallbackCompatible } from "./fallback.js";

/** Минимальная заглушка AIModel — для тестов нужны только media-related поля. */
function makeFallback(opts: {
  mediaInputs?: MediaInputSlot[];
  durationRange?: { min: number; max: number };
}): AIModel {
  return {
    id: "test-model",
    name: "test",
    description: "test",
    section: "design",
    provider: "test",
    costUsdPerRequest: 0,
    inputCostUsdPerMToken: 0,
    outputCostUsdPerMToken: 0,
    supportsImages: false,
    supportsVoice: false,
    supportsWeb: false,
    isAsync: false,
    contextStrategy: "db_history",
    contextMaxMessages: 0,
    mediaInputs: opts.mediaInputs,
    durationRange: opts.durationRange,
  };
}

describe("isFallbackCompatible", () => {
  // ── Slot capacity ───────────────────────────────────────────────────────────
  describe("slot capacity check", () => {
    test("совместимо при пустых mediaInputs у задачи", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "edit", mode: "edit", labelKey: "edit", maxImages: 4 }],
      });
      expect(isFallbackCompatible(fb, undefined)).toBe(true);
      expect(isFallbackCompatible(fb, {})).toBe(true);
      expect(isFallbackCompatible(fb, { edit: [] })).toBe(true);
    });

    test("совместимо при пустых mediaInputs И отсутствии fallback.mediaInputs", () => {
      const fb = makeFallback({ mediaInputs: undefined });
      expect(isFallbackCompatible(fb, undefined)).toBe(true);
    });

    test("несовместимо если у fallback нет slot'а который использует задача", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "edit", mode: "edit", labelKey: "edit" }],
      });
      // Задача использует ref_videos — у fallback такого slot'а нет
      expect(isFallbackCompatible(fb, { ref_videos: ["url1"] })).toBe(false);
    });

    test("несовместимо если urls.length > slot.maxImages у fallback", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "edit", mode: "edit", labelKey: "edit", maxImages: 5 }],
      });
      const sixUrls = ["a", "b", "c", "d", "e", "f"];
      expect(isFallbackCompatible(fb, { edit: sixUrls })).toBe(false);
    });

    test("совместимо если urls.length === slot.maxImages", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "edit", mode: "edit", labelKey: "edit", maxImages: 5 }],
      });
      const fiveUrls = ["a", "b", "c", "d", "e"];
      expect(isFallbackCompatible(fb, { edit: fiveUrls })).toBe(true);
    });

    test("default maxImages = 1 если не задан", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "first_frame", mode: "first_frame", labelKey: "first_frame" }],
      });
      expect(isFallbackCompatible(fb, { first_frame: ["url1"] })).toBe(true);
      expect(isFallbackCompatible(fb, { first_frame: ["url1", "url2"] })).toBe(false);
    });

    test("совместимо при множественных слотах если все покрыты", () => {
      const fb = makeFallback({
        mediaInputs: [
          { slotKey: "first_frame", mode: "first_frame", labelKey: "ff" },
          { slotKey: "last_frame", mode: "last_frame", labelKey: "lf" },
          { slotKey: "ref_element_1", mode: "reference_element", labelKey: "el", maxImages: 4 },
        ],
      });
      expect(
        isFallbackCompatible(fb, {
          first_frame: ["url1"],
          last_frame: ["url2"],
          ref_element_1: ["a", "b", "c"],
        }),
      ).toBe(true);
    });
  });

  // ── Required slots ──────────────────────────────────────────────────────────
  describe("required-slot check", () => {
    test("несовместимо если required slot не заполнен (FAL grok r2v case)", () => {
      const fb = makeFallback({
        mediaInputs: [
          {
            slotKey: "ref_images",
            mode: "reference_image",
            labelKey: "refs",
            maxImages: 7,
            required: true,
          },
        ],
      });
      // Задача без ref_images (pure t2v) — required slot не заполнен
      expect(isFallbackCompatible(fb, undefined)).toBe(false);
      expect(isFallbackCompatible(fb, {})).toBe(false);
      expect(isFallbackCompatible(fb, { ref_images: [] })).toBe(false);
    });

    test("совместимо если required slot заполнен", () => {
      const fb = makeFallback({
        mediaInputs: [
          {
            slotKey: "ref_images",
            mode: "reference_image",
            labelKey: "refs",
            required: true,
          },
        ],
      });
      expect(isFallbackCompatible(fb, { ref_images: ["url1"] })).toBe(true);
    });

    test("required + capacity нарушение → несовместимо (capacity wins)", () => {
      const fb = makeFallback({
        mediaInputs: [
          {
            slotKey: "ref_images",
            mode: "reference_image",
            labelKey: "refs",
            maxImages: 2,
            required: true,
          },
        ],
      });
      expect(isFallbackCompatible(fb, { ref_images: ["a", "b", "c"] })).toBe(false);
    });

    test("optional slot — отсутствие OK, наличие проверяется по capacity", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "edit", mode: "edit", labelKey: "edit", maxImages: 4 }],
      });
      // Без edit — OK
      expect(isFallbackCompatible(fb, {})).toBe(true);
      // С edit в пределах — OK
      expect(isFallbackCompatible(fb, { edit: ["a", "b"] })).toBe(true);
    });
  });

  // ── Duration check ──────────────────────────────────────────────────────────
  describe("duration check", () => {
    test("совместимо если durationRange не задан у fallback", () => {
      const fb = makeFallback({});
      expect(isFallbackCompatible(fb, undefined, 10)).toBe(true);
      expect(isFallbackCompatible(fb, undefined, 999)).toBe(true);
    });

    test("совместимо если jobDuration не передан", () => {
      const fb = makeFallback({ durationRange: { min: 4, max: 12 } });
      expect(isFallbackCompatible(fb, undefined)).toBe(true);
      expect(isFallbackCompatible(fb, undefined, undefined)).toBe(true);
    });

    test("совместимо если duration в диапазоне [min, max]", () => {
      const fb = makeFallback({ durationRange: { min: 4, max: 12 } });
      expect(isFallbackCompatible(fb, undefined, 4)).toBe(true);
      expect(isFallbackCompatible(fb, undefined, 8)).toBe(true);
      expect(isFallbackCompatible(fb, undefined, 12)).toBe(true);
    });

    test("несовместимо если duration < min", () => {
      const fb = makeFallback({ durationRange: { min: 6, max: 30 } });
      expect(isFallbackCompatible(fb, undefined, 3)).toBe(false);
      expect(isFallbackCompatible(fb, undefined, 5)).toBe(false);
    });

    test("несовместимо если duration > max (FAL grok r2v 10s vs primary 30s)", () => {
      const fb = makeFallback({ durationRange: { min: 6, max: 10 } });
      expect(isFallbackCompatible(fb, undefined, 11)).toBe(false);
      expect(isFallbackCompatible(fb, undefined, 30)).toBe(false);
    });
  });

  // ── Combined checks ─────────────────────────────────────────────────────────
  describe("combined checks", () => {
    test("FAL grok t2v fallback: совместимо для t2v без ref_images, duration в range", () => {
      // Mirror real FAL grok-imagine t2v fallback entry
      const fb = makeFallback({
        mediaInputs: [],
        durationRange: { min: 6, max: 15 },
      });
      expect(isFallbackCompatible(fb, undefined, 10)).toBe(true);
      expect(isFallbackCompatible(fb, {}, 10)).toBe(true);
    });

    test("FAL grok t2v fallback: несовместимо если есть ref_images (нет slot'а)", () => {
      const fb = makeFallback({
        mediaInputs: [],
        durationRange: { min: 6, max: 15 },
      });
      expect(isFallbackCompatible(fb, { ref_images: ["url"] }, 10)).toBe(false);
    });

    test("FAL grok r2v fallback: несовместимо для t2v (required slot)", () => {
      const fb = makeFallback({
        mediaInputs: [
          {
            slotKey: "ref_images",
            mode: "reference_image",
            labelKey: "refs",
            maxImages: 7,
            required: true,
          },
        ],
        durationRange: { min: 6, max: 10 },
      });
      expect(isFallbackCompatible(fb, undefined, 8)).toBe(false);
    });

    test("FAL grok r2v fallback: несовместимо при duration > 10 (даже с ref_images)", () => {
      const fb = makeFallback({
        mediaInputs: [
          {
            slotKey: "ref_images",
            mode: "reference_image",
            labelKey: "refs",
            maxImages: 7,
            required: true,
          },
        ],
        durationRange: { min: 6, max: 10 },
      });
      expect(isFallbackCompatible(fb, { ref_images: ["url"] }, 12)).toBe(false);
    });

    test("FAL grok r2v fallback: совместимо при ref_images и duration в range", () => {
      const fb = makeFallback({
        mediaInputs: [
          {
            slotKey: "ref_images",
            mode: "reference_image",
            labelKey: "refs",
            maxImages: 7,
            required: true,
          },
        ],
        durationRange: { min: 6, max: 10 },
      });
      expect(isFallbackCompatible(fb, { ref_images: ["a", "b"] }, 8)).toBe(true);
    });

    test("evolink nano-banana-1: maxImages 5 (vs primary KIE 10) — рубит при 6+", () => {
      const fb = makeFallback({
        mediaInputs: [{ slotKey: "edit", mode: "edit", labelKey: "edit", maxImages: 5 }],
      });
      // ≤5 — OK
      expect(isFallbackCompatible(fb, { edit: ["a", "b", "c", "d", "e"] })).toBe(true);
      // 6 — fail
      expect(isFallbackCompatible(fb, { edit: ["a", "b", "c", "d", "e", "f"] })).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────
  describe("edge cases", () => {
    test("игнорирует slot keys с пустым массивом urls", () => {
      const fb = makeFallback({
        mediaInputs: [], // нет ни одного слота
      });
      // Job содержит ключ с пустым массивом — должно быть OK (slot не используется)
      expect(isFallbackCompatible(fb, { edit: [] })).toBe(true);
      expect(isFallbackCompatible(fb, { edit: [], ref_videos: [] })).toBe(true);
    });

    test("non-array значение в jobMediaInputs — игнорируется как пустое", () => {
      const fb = makeFallback({ mediaInputs: [] });
      // TypeScript бы не пропустил, но defensive runtime check
      expect(isFallbackCompatible(fb, { edit: undefined as unknown as string[] })).toBe(true);
    });

    test("durationRange с нулевыми значениями (corner case)", () => {
      const fb = makeFallback({ durationRange: { min: 0, max: 0 } });
      expect(isFallbackCompatible(fb, undefined, 0)).toBe(true);
      expect(isFallbackCompatible(fb, undefined, 1)).toBe(false);
    });
  });
});
