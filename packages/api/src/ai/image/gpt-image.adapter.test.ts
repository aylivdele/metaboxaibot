import { describe, test, expect } from "vitest";
import { kieAspectResolutionToOpenAISize } from "./gpt-image.adapter.js";

describe("kieAspectResolutionToOpenAISize", () => {
  // ── Square / auto ─────────────────────────────────────────────────────────
  describe("square / auto aspect", () => {
    test("undefined aspect → 1024x1024 (default 1K)", () => {
      expect(kieAspectResolutionToOpenAISize(undefined, "1K")).toBe("1024x1024");
    });

    test("'auto' → 1024x1024 (1K)", () => {
      expect(kieAspectResolutionToOpenAISize("auto", "1K")).toBe("1024x1024");
    });

    test("'1:1' + 1K → 1024x1024", () => {
      expect(kieAspectResolutionToOpenAISize("1:1", "1K")).toBe("1024x1024");
    });

    test("'1:1' + 2K → 2048x2048", () => {
      expect(kieAspectResolutionToOpenAISize("1:1", "2K")).toBe("2048x2048");
    });

    test("'1:1' + 4K → 2048x2048 safety (KIE правила запрещают эту комбу)", () => {
      // KIE unavailableIf: aspect=1:1 + 4K disabled. Adapter маппит на 2K square чтобы не упасть.
      expect(kieAspectResolutionToOpenAISize("1:1", "4K")).toBe("2048x2048");
    });

    test("'auto' + 2K → 2048x2048", () => {
      expect(kieAspectResolutionToOpenAISize("auto", "2K")).toBe("2048x2048");
    });
  });

  // ── Landscape 16:9 ────────────────────────────────────────────────────────
  describe("landscape 16:9", () => {
    test("16:9 + 1K → 1536x1024", () => {
      expect(kieAspectResolutionToOpenAISize("16:9", "1K")).toBe("1536x1024");
    });

    test("16:9 + 2K → 2048x1152", () => {
      expect(kieAspectResolutionToOpenAISize("16:9", "2K")).toBe("2048x1152");
    });

    test("16:9 + 4K → 3840x2160 (UHD)", () => {
      expect(kieAspectResolutionToOpenAISize("16:9", "4K")).toBe("3840x2160");
    });
  });

  // ── Portrait 9:16 ─────────────────────────────────────────────────────────
  describe("portrait 9:16", () => {
    test("9:16 + 1K → 1024x1536", () => {
      expect(kieAspectResolutionToOpenAISize("9:16", "1K")).toBe("1024x1536");
    });

    test("9:16 + 2K → 1152x2048", () => {
      expect(kieAspectResolutionToOpenAISize("9:16", "2K")).toBe("1152x2048");
    });

    test("9:16 + 4K → 2160x3840", () => {
      expect(kieAspectResolutionToOpenAISize("9:16", "4K")).toBe("2160x3840");
    });
  });

  // ── 4:3 / 3:4 — нет точного match в OpenAI, маппится на ближайший ────────
  describe("approximate ratios (no exact OpenAI match)", () => {
    test("4:3 + 1K → 1536x1024 (closest landscape, OpenAI 3:2)", () => {
      expect(kieAspectResolutionToOpenAISize("4:3", "1K")).toBe("1536x1024");
    });

    test("4:3 + 2K → 2048x1152", () => {
      expect(kieAspectResolutionToOpenAISize("4:3", "2K")).toBe("2048x1152");
    });

    test("3:4 + 1K → 1024x1536 (closest portrait)", () => {
      expect(kieAspectResolutionToOpenAISize("3:4", "1K")).toBe("1024x1536");
    });

    test("3:4 + 2K → 1152x2048", () => {
      expect(kieAspectResolutionToOpenAISize("3:4", "2K")).toBe("1152x2048");
    });
  });

  // ── Unknown / safety ──────────────────────────────────────────────────────
  describe("unknown ratios", () => {
    test("неизвестный ratio → safe default 1024x1024", () => {
      expect(kieAspectResolutionToOpenAISize("21:9", "1K")).toBe("1024x1024");
      expect(kieAspectResolutionToOpenAISize("5:4", "2K")).toBe("1024x1024");
    });

    test("пустая строка как aspect → square default", () => {
      expect(kieAspectResolutionToOpenAISize("", "1K")).toBe("1024x1024");
    });

    test("неизвестный resolution + известный aspect → 1K-equivalent (default in branch)", () => {
      // 16:9 + неизвестный resolution → попадает в default branch (return "1536x1024")
      expect(kieAspectResolutionToOpenAISize("16:9", "8K")).toBe("1536x1024");
    });
  });
});
