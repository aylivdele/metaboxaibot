import { describe, test, expect, vi, beforeEach } from "vitest";
import { EvolinkImageAdapter } from "./evolink.adapter.js";
import type { ImageInput } from "./base.adapter.js";

function createMockFetch(): {
  fetch: typeof globalThis.fetch;
  lastUrl: () => string;
  lastBody: () => Record<string, unknown>;
} {
  let captured: { url: string; body: string } | null = null;
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    captured = {
      url: String(url),
      body: typeof init?.body === "string" ? init.body : "",
    };
    return new Response(JSON.stringify({ id: "task-img-123", status: "pending" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    fetch: mock,
    lastUrl: () => captured?.url ?? "",
    lastBody: () => JSON.parse(captured?.body ?? "{}"),
  };
}

const baseInput = (overrides: Partial<ImageInput> = {}): ImageInput => ({
  prompt: "test prompt",
  ...overrides,
});

describe("EvolinkImageAdapter — Nano Banana семейство", () => {
  let mock: ReturnType<typeof createMockFetch>;
  beforeEach(() => {
    mock = createMockFetch();
  });

  test("nano-banana-1: модель → nano-banana-beta, prompt + size", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-1", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "16:9" } }));
    const body = mock.lastBody();
    expect(body.model).toBe("nano-banana-beta");
    expect(body.prompt).toBe("test prompt");
    expect(body.size).toBe("16:9");
    expect(body.quality).toBeUndefined(); // v1 не имеет quality
  });

  test("nano-banana-2: модель → gemini-3.1-flash-image-preview, resolution → quality", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "1:1", resolution: "2K" } }));
    const body = mock.lastBody();
    expect(body.model).toBe("gemini-3.1-flash-image-preview");
    expect(body.size).toBe("1:1");
    expect(body.quality).toBe("2K");
  });

  test("nano-banana-pro: модель → gemini-3-pro-image-preview, resolution → quality", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-pro", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "16:9", resolution: "4K" } }));
    const body = mock.lastBody();
    expect(body.model).toBe("gemini-3-pro-image-preview");
    expect(body.size).toBe("16:9");
    expect(body.quality).toBe("4K");
  });

  test("nano-banana-1: ref images cap = 5", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-1", "test-key", mock.fetch);
    const tenImages = Array.from({ length: 10 }, (_, i) => `https://i${i}.png`);
    await adapter.submit(baseInput({ mediaInputs: { edit: tenImages } }));
    const body = mock.lastBody();
    expect((body.image_urls as string[]).length).toBe(5);
  });

  test("nano-banana-2: ref images cap = 14", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-2", "test-key", mock.fetch);
    const twentyImages = Array.from({ length: 20 }, (_, i) => `https://i${i}.png`);
    await adapter.submit(baseInput({ mediaInputs: { edit: twentyImages } }));
    expect((mock.lastBody().image_urls as string[]).length).toBe(14);
  });

  test("nano-banana-2: model_params.web_search передаётся когда enable_web_search=true", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { enable_web_search: true } }));
    expect(mock.lastBody().model_params).toMatchObject({ web_search: true });
  });

  test("nano-banana-2: model_params не отправляется когда нет evolink-specific settings", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "1:1" } }));
    expect(mock.lastBody().model_params).toBeUndefined();
  });

  test("nano-banana-2: image_search + thinking_level в model_params", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        modelSettings: {
          enable_web_search: true,
          image_search: true,
          thinking_level: "high",
        },
      }),
    );
    expect(mock.lastBody().model_params).toEqual({
      web_search: true,
      image_search: true,
      thinking_level: "high",
    });
  });

  test("nano-banana-pro: image_search/thinking_level НЕ передаются (только v2)", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-pro", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        modelSettings: {
          enable_web_search: true,
          image_search: true,
          thinking_level: "high",
        },
      }),
    );
    const body = mock.lastBody();
    expect(body.model_params).toEqual({ web_search: true });
  });

  test("nano-banana: edit images через legacy imageUrl поле", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-1", "test-key", mock.fetch);
    await adapter.submit({ prompt: "test", imageUrl: "https://legacy.png" });
    expect(mock.lastBody().image_urls).toEqual(["https://legacy.png"]);
  });

  test("nano-banana: mediaInputs.edit имеет приоритет над legacy imageUrl", async () => {
    const adapter = new EvolinkImageAdapter("nano-banana-1", "test-key", mock.fetch);
    await adapter.submit({
      prompt: "test",
      imageUrl: "https://legacy.png",
      mediaInputs: { edit: ["https://new.png"] },
    });
    expect(mock.lastBody().image_urls).toEqual(["https://new.png"]);
  });
});

describe("EvolinkImageAdapter — gpt-image-2 (dual-style settings)", () => {
  let mock: ReturnType<typeof createMockFetch>;
  beforeEach(() => {
    mock = createMockFetch();
  });

  test("gpt-image-2: модель = gpt-image-2", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput());
    expect(mock.lastBody().model).toBe("gpt-image-2");
  });

  test("KIE-style: aspect_ratio → size (ratio format), resolution → resolution", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "16:9", resolution: "2K" } }));
    const body = mock.lastBody();
    expect(body.size).toBe("16:9");
    expect(body.resolution).toBe("2K");
  });

  test("OpenAI-style: explicit size (pixel format) — resolution НЕ передаётся", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { size: "1024x1024", quality: "high" } }));
    const body = mock.lastBody();
    expect(body.size).toBe("1024x1024");
    expect(body.resolution).toBeUndefined();
    expect(body.quality).toBe("high");
  });

  test("OpenAI-style: size имеет приоритет над KIE aspect_ratio", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        modelSettings: { size: "1536x1024", aspect_ratio: "1:1" },
      }),
    );
    expect(mock.lastBody().size).toBe("1536x1024");
  });

  test("aspect_ratio 'auto' — НЕ передаётся (default на стороне evolink)", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "auto", resolution: "1K" } }));
    expect(mock.lastBody().size).toBeUndefined();
  });

  test("n parameter (1-10) clamping", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { n: 5 } }));
    expect(mock.lastBody().n).toBe(5);

    mock = createMockFetch();
    const a2 = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await a2.submit(baseInput({ modelSettings: { n: 999 } }));
    expect(mock.lastBody().n).toBe(10);
  });

  test("n=1 (или unset) — поле n пропускается", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { n: 1 } }));
    expect(mock.lastBody().n).toBeUndefined();
  });

  test("ref images cap = 16", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    const twentyImgs = Array.from({ length: 20 }, (_, i) => `https://i${i}.png`);
    await adapter.submit(baseInput({ mediaInputs: { edit: twentyImgs } }));
    expect((mock.lastBody().image_urls as string[]).length).toBe(16);
  });

  test("без media inputs — image_urls не передаётся", async () => {
    const adapter = new EvolinkImageAdapter("gpt-image-2", "test-key", mock.fetch);
    await adapter.submit(baseInput());
    expect(mock.lastBody().image_urls).toBeUndefined();
  });
});

describe("EvolinkImageAdapter — error handling", () => {
  test("unknown modelId → throws", async () => {
    const adapter = new EvolinkImageAdapter("unknown-model", "test-key", vi.fn());
    await expect(adapter.submit(baseInput())).rejects.toThrow(/unknown model/i);
  });

  test("HTTP non-2xx response → throws Error со status", async () => {
    const failingFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "rate limit" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof globalThis.fetch;
    const adapter = new EvolinkImageAdapter("nano-banana-1", "test-key", failingFetch);
    await expect(adapter.submit(baseInput())).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("429"),
    });
  });

  test("response без id → throws", async () => {
    const noIdFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof globalThis.fetch;
    const adapter = new EvolinkImageAdapter("nano-banana-1", "test-key", noIdFetch);
    await expect(adapter.submit(baseInput())).rejects.toThrow(/no task id/i);
  });
});
