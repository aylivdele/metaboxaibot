import { describe, test, expect, vi, beforeEach } from "vitest";
import { EvolinkVideoAdapter } from "./evolink.adapter.js";
import type { VideoInput } from "./base.adapter.js";

/**
 * Создаёт mock fetch который возвращает успешный submit-response с фиксированным task_id.
 * Сохраняет последний captured request для assertions.
 */
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
    return new Response(JSON.stringify({ id: "task-mock-123", status: "pending" }), {
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

const baseInput = (overrides: Partial<VideoInput> = {}): VideoInput => ({
  prompt: "test prompt",
  ...overrides,
});

describe("EvolinkVideoAdapter — Kling-V3 Motion Control", () => {
  let mock: ReturnType<typeof createMockFetch>;
  beforeEach(() => {
    mock = createMockFetch();
  });

  test("kling-motion: required image + video, quality=720p, default orientation=video", async () => {
    const adapter = new EvolinkVideoAdapter("kling-motion", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: { first_frame: ["https://img.png"], motion_video: ["https://vid.mp4"] },
      }),
    );
    const body = mock.lastBody();
    expect(body.model).toBe("kling-v3-motion-control");
    expect(body.image_urls).toEqual(["https://img.png"]);
    expect(body.video_urls).toEqual(["https://vid.mp4"]);
    expect(body.quality).toBe("720p");
    expect(body.model_params).toMatchObject({
      character_orientation: "video",
      keep_sound: true,
    });
  });

  test("kling-motion-pro: quality=1080p", async () => {
    const adapter = new EvolinkVideoAdapter("kling-motion-pro", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: { first_frame: ["https://img.png"], motion_video: ["https://vid.mp4"] },
      }),
    );
    expect(mock.lastBody().quality).toBe("1080p");
  });

  test("kling-motion: respects character_orientation + keep_sound from settings", async () => {
    const adapter = new EvolinkVideoAdapter("kling-motion", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: { first_frame: ["https://img.png"], motion_video: ["https://vid.mp4"] },
        modelSettings: { character_orientation: "image", keep_sound: false },
      }),
    );
    expect(mock.lastBody().model_params).toMatchObject({
      character_orientation: "image",
      keep_sound: false,
    });
  });

  test("kling-motion: prompt опционален (omitted если пусто)", async () => {
    const adapter = new EvolinkVideoAdapter("kling-motion", "test-key", mock.fetch);
    await adapter.submit({
      prompt: "",
      mediaInputs: { first_frame: ["https://img.png"], motion_video: ["https://vid.mp4"] },
    });
    expect(mock.lastBody().prompt).toBeUndefined();
  });

  test("kling-motion: throws UserFacingError если нет reference image", async () => {
    const adapter = new EvolinkVideoAdapter("kling-motion", "test-key", mock.fetch);
    await expect(
      adapter.submit(baseInput({ mediaInputs: { motion_video: ["https://vid.mp4"] } })),
    ).rejects.toThrow(/reference image required/);
  });

  test("kling-motion: throws UserFacingError если нет reference video", async () => {
    const adapter = new EvolinkVideoAdapter("kling-motion", "test-key", mock.fetch);
    await expect(
      adapter.submit(baseInput({ mediaInputs: { first_frame: ["https://img.png"] } })),
    ).rejects.toThrow(/reference video required/);
  });
});

describe("EvolinkVideoAdapter — Kling-O3 (auto t2v/i2v dispatch)", () => {
  let mock: ReturnType<typeof createMockFetch>;
  beforeEach(() => {
    mock = createMockFetch();
  });

  test("kling: pure text → t2v endpoint, default sound=on, quality=720p", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit(baseInput({ prompt: "a cat" }));
    const body = mock.lastBody();
    expect(body.model).toBe("kling-o3-text-to-video");
    expect(body.sound).toBe("on");
    expect(body.quality).toBe("720p");
    expect(body.image_start).toBeUndefined();
    expect(body.image_urls).toBeUndefined();
  });

  test("kling-pro: t2v + quality=1080p + aspect_ratio default 16:9 при auto", async () => {
    const adapter = new EvolinkVideoAdapter("kling-pro", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        modelSettings: { aspect_ratio: "auto", duration: 8 },
      }),
    );
    const body = mock.lastBody();
    expect(body.model).toBe("kling-o3-text-to-video");
    expect(body.quality).toBe("1080p");
    expect(body.aspect_ratio).toBe("16:9"); // t2v fallback на 16:9 при "auto"
    expect(body.duration).toBe(8);
  });

  test("kling: с first_frame → i2v endpoint, image_start заполнен", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: { first_frame: ["https://start.png"] },
      }),
    );
    const body = mock.lastBody();
    expect(body.model).toBe("kling-o3-image-to-video");
    expect(body.image_start).toBe("https://start.png");
    expect(body.image_end).toBeUndefined();
  });

  test("kling: first_frame + last_frame → i2v с обоими полями", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: {
          first_frame: ["https://start.png"],
          last_frame: ["https://end.png"],
        },
      }),
    );
    const body = mock.lastBody();
    expect(body.image_start).toBe("https://start.png");
    expect(body.image_end).toBe("https://end.png");
  });

  test("kling: ref_element_*[0] flatten в image_urls (по одному из каждого)", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: {
          ref_element_1: ["https://e1a.png", "https://e1b.png"], // только e1a
          ref_element_2: ["https://e2a.png"],
          ref_element_3: ["https://e3a.png", "https://e3b.png"], // только e3a
        },
      }),
    );
    const body = mock.lastBody();
    expect(body.image_urls).toEqual(["https://e1a.png", "https://e2a.png", "https://e3a.png"]);
  });

  test("kling: prompt @element1 → <<<image_1>>> remap для evolink", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit({
      prompt: "@element1 walks past @element2",
      mediaInputs: {
        ref_element_1: ["https://a.png"],
        ref_element_2: ["https://b.png"],
      },
    });
    expect(mock.lastBody().prompt).toBe("<<<image_1>>> walks past <<<image_2>>>");
  });

  test("kling: prompt @elementN с N > image_urls.length — оставляет literal", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit({
      prompt: "@element1 and @element3",
      mediaInputs: { ref_element_1: ["https://a.png"] }, // только 1 image
    });
    // @element1 → <<<image_1>>>, но @element3 — нет image[3] → остаётся literal
    expect(mock.lastBody().prompt).toBe("<<<image_1>>> and @element3");
  });

  test("kling: generate_audio=false → sound: 'off'", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { generate_audio: false } }));
    expect(mock.lastBody().sound).toBe("off");
  });

  test("kling: duration clamp 3-15 (12 ok, 30 → 15, 1 → 3)", async () => {
    const adapter = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { duration: 12 } }));
    expect(mock.lastBody().duration).toBe(12);

    mock = createMockFetch();
    const adapter2 = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter2.submit(baseInput({ modelSettings: { duration: 30 } }));
    expect(mock.lastBody().duration).toBe(15);

    mock = createMockFetch();
    const adapter3 = new EvolinkVideoAdapter("kling", "test-key", mock.fetch);
    await adapter3.submit(baseInput({ modelSettings: { duration: 1 } }));
    expect(mock.lastBody().duration).toBe(3);
  });
});

describe("EvolinkVideoAdapter — Seedance 2.0 (3-mode dispatch)", () => {
  let mock: ReturnType<typeof createMockFetch>;
  beforeEach(() => {
    mock = createMockFetch();
  });

  test("seedance-2: pure text → seedance-2.0-text-to-video", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput());
    const body = mock.lastBody();
    expect(body.model).toBe("seedance-2.0-text-to-video");
    expect(body.image_urls).toBeUndefined();
    expect(body.video_urls).toBeUndefined();
  });

  test("seedance-2-fast: pure text → seedance-2.0-fast-text-to-video", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2-fast", "test-key", mock.fetch);
    await adapter.submit(baseInput());
    expect(mock.lastBody().model).toBe("seedance-2.0-fast-text-to-video");
  });

  test("seedance-2: first_frame → image-to-video с image_urls=[first]", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ mediaInputs: { first_frame: ["https://a.png"] } }));
    const body = mock.lastBody();
    expect(body.model).toBe("seedance-2.0-image-to-video");
    expect(body.image_urls).toEqual(["https://a.png"]);
  });

  test("seedance-2: first + last frame → image-to-video с [first, last]", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: {
          first_frame: ["https://a.png"],
          last_frame: ["https://b.png"],
        },
      }),
    );
    expect(mock.lastBody().image_urls).toEqual(["https://a.png", "https://b.png"]);
  });

  test("seedance-2: ref_videos → reference-to-video с video_urls", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: { ref_videos: ["https://v.mp4"] },
      }),
    );
    const body = mock.lastBody();
    expect(body.model).toBe("seedance-2.0-reference-to-video");
    expect(body.video_urls).toEqual(["https://v.mp4"]);
  });

  test("seedance-2: ref_images + ref_audios → r2v со всеми arrays", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: {
          ref_images: ["https://i.png"],
          ref_videos: ["https://v.mp4"],
          ref_audios: ["https://a.mp3"],
        },
      }),
    );
    const body = mock.lastBody();
    expect(body.model).toBe("seedance-2.0-reference-to-video");
    expect(body.image_urls).toEqual(["https://i.png"]);
    expect(body.video_urls).toEqual(["https://v.mp4"]);
    expect(body.audio_urls).toEqual(["https://a.mp3"]);
  });

  test("seedance-2: cap 9 image_urls / 3 video_urls / 3 audio_urls", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: {
          ref_images: Array.from({ length: 12 }, (_, i) => `https://i${i}.png`),
          ref_videos: Array.from({ length: 5 }, (_, i) => `https://v${i}.mp4`),
          ref_audios: Array.from({ length: 5 }, (_, i) => `https://a${i}.mp3`),
        },
      }),
    );
    const body = mock.lastBody();
    expect((body.image_urls as string[]).length).toBe(9);
    expect((body.video_urls as string[]).length).toBe(3);
    expect((body.audio_urls as string[]).length).toBe(3);
  });

  test("seedance-2: aspect_ratio 'auto' → 'adaptive'", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "auto" } }));
    expect(mock.lastBody().aspect_ratio).toBe("adaptive");
  });

  test("seedance-2: duration clamp 4-15", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { duration: 100 } }));
    expect(mock.lastBody().duration).toBe(15);

    mock = createMockFetch();
    const adapter2 = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter2.submit(baseInput({ modelSettings: { duration: 1 } }));
    expect(mock.lastBody().duration).toBe(4);
  });

  test("seedance-2-fast: 1080p выбран → клампится на 720p (fast не поддерживает)", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2-fast", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { resolution: "1080p" } }));
    expect(mock.lastBody().quality).toBe("720p");
  });

  test("seedance-2: 1080p допустим (standard поддерживает)", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { resolution: "1080p" } }));
    expect(mock.lastBody().quality).toBe("1080p");
  });

  test("seedance-2: enable_web_search в t2v режиме → model_params.web_search=true", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { enable_web_search: true } }));
    expect(mock.lastBody().model_params).toEqual({ web_search: true });
  });

  test("seedance-2: enable_web_search в i2v режиме → НЕ передаётся (только t2v)", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: { first_frame: ["https://a.png"] },
        modelSettings: { enable_web_search: true },
      }),
    );
    expect(mock.lastBody().model_params).toBeUndefined();
  });

  test("seedance-2: generate_audio=false → передаётся false", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { generate_audio: false } }));
    expect(mock.lastBody().generate_audio).toBe(false);
  });

  test("seedance-2: generate_audio default true когда не задан", async () => {
    const adapter = new EvolinkVideoAdapter("seedance-2", "test-key", mock.fetch);
    await adapter.submit(baseInput());
    expect(mock.lastBody().generate_audio).toBe(true);
  });
});

describe("EvolinkVideoAdapter — Seedance 1.5 Pro", () => {
  let mock: ReturnType<typeof createMockFetch>;
  beforeEach(() => {
    mock = createMockFetch();
  });

  test("seedance: модель 'seedance-1.5-pro', mode auto-detected по image_urls", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(baseInput());
    const body = mock.lastBody();
    expect(body.model).toBe("seedance-1.5-pro");
    expect(body.image_urls).toBeUndefined(); // t2v mode
  });

  test("seedance: 1 image (first_frame) → image-to-video", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(baseInput({ mediaInputs: { first_frame: ["https://a.png"] } }));
    expect(mock.lastBody().image_urls).toEqual(["https://a.png"]);
  });

  test("seedance: 2 images (first + last) → first-last-frame", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(
      baseInput({
        mediaInputs: {
          first_frame: ["https://a.png"],
          last_frame: ["https://b.png"],
        },
      }),
    );
    expect(mock.lastBody().image_urls).toEqual(["https://a.png", "https://b.png"]);
  });

  test("seedance: duration clamp 4-12", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { duration: 100 } }));
    expect(mock.lastBody().duration).toBe(12);

    mock = createMockFetch();
    const adapter2 = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter2.submit(baseInput({ modelSettings: { duration: 1 } }));
    expect(mock.lastBody().duration).toBe(4);
  });

  test("seedance: aspect_ratio передаётся (без 'auto' трансформации)", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "9:16" } }));
    expect(mock.lastBody().aspect_ratio).toBe("9:16");
  });

  test("seedance: aspect_ratio 'auto' пропускается (default на провайдере)", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { aspect_ratio: "auto" } }));
    expect(mock.lastBody().aspect_ratio).toBeUndefined();
  });

  test("seedance: resolution → quality", async () => {
    const adapter = new EvolinkVideoAdapter("seedance", "test-key", mock.fetch);
    await adapter.submit(baseInput({ modelSettings: { resolution: "480p" } }));
    expect(mock.lastBody().quality).toBe("480p");
  });
});

describe("EvolinkVideoAdapter — error handling", () => {
  test("unknown modelId → throws", async () => {
    const adapter = new EvolinkVideoAdapter("unknown-model", "test-key", vi.fn());
    await expect(adapter.submit(baseInput())).rejects.toThrow(/unknown model/);
  });
});
