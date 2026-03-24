import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const HIGGSFIELD_API = "https://platform.higgsfield.ai";
const HIGGSFIELD_MODEL = "higgsfield-ai/dop/standard";

interface HiggsFieldStatus {
  status: "queued" | "in_progress" | "nsfw" | "failed" | "completed";
  assets?: { video?: string };
  error?: string;
}

/**
 * Higgsfield official API adapter (async queue).
 * Auth: Authorization: Key {apiKey}:{apiSecret}
 */
export class HiggsFieldAdapter implements VideoAdapter {
  readonly modelId = "higgsfield";

  private readonly authHeader: string;

  constructor(
    apiKey = config.ai.higgsfieldApiKey ?? "",
    apiSecret = config.ai.higgsfieldApiSecret ?? "",
  ) {
    this.authHeader = `Key ${apiKey}:${apiSecret}`;
  }

  private headers() {
    return {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.imageUrl) body.image_url = input.imageUrl;
    if (input.duration) body.duration = input.duration;

    const res = await fetch(`${HIGGSFIELD_API}/${HIGGSFIELD_MODEL}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { request_id: string };
    return data.request_id;
  }

  async poll(requestId: string): Promise<VideoResult | null> {
    const res = await fetch(`${HIGGSFIELD_API}/requests/${requestId}/status`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield poll failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as HiggsFieldStatus;

    if (data.status === "failed" || data.status === "nsfw") {
      throw new Error(`Higgsfield generation failed: ${data.error ?? data.status}`);
    }
    if (data.status !== "completed") return null;

    const url = data.assets?.video;
    if (!url) throw new Error("Higgsfield: no video URL in completed generation");
    return { url, filename: "higgsfield.mp4" };
  }
}
