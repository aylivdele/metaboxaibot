import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const LUMA_API = "https://api.lumalabs.ai/dream-machine/v1";

interface LumaGeneration {
  id: string;
  state: string;
  assets?: { video?: string };
  failure_reason?: string;
}

/**
 * Luma Dream Machine adapter (REST API). Supports luma (Ray3.14) and luma-ray2.
 */
export class LumaAdapter implements VideoAdapter {
  readonly modelId: string;

  private readonly apiKey: string;

  constructor(modelId = "luma", apiKey = config.ai.luma ?? "") {
    this.modelId = modelId;
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "16:9",
      loop: false,
    };

    if (input.imageUrl) {
      body.keyframes = {
        frame0: { type: "image", url: input.imageUrl },
      };
    }

    const res = await fetch(`${LUMA_API}/generations`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Luma submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as LumaGeneration;
    return data.id;
  }

  async poll(generationId: string): Promise<VideoResult | null> {
    const res = await fetch(`${LUMA_API}/generations/${generationId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Luma poll failed: ${res.status} ${text}`);
    }

    const gen = (await res.json()) as LumaGeneration;

    if (gen.state === "failed") {
      throw new Error(`Luma generation failed: ${gen.failure_reason ?? "unknown"}`);
    }
    if (gen.state !== "completed") return null;

    const url = gen.assets?.video;
    if (!url) throw new Error("Luma: no video URL in completed generation");
    return { url, filename: "luma.mp4" };
  }
}
