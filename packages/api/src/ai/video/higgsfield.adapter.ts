import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";
import { logger } from "../../logger.js";

const HIGGSFIELD_API = "https://platform.higgsfield.ai";

const DOP_MODEL: Record<string, string> = {
  "higgsfield-lite": "dop-lite",
  higgsfield: "dop-turbo",
  "higgsfield-preview": "dop-preview",
};

interface HiggsFieldStatus {
  status: "queued" | "in_progress" | "nsfw" | "failed" | "completed" | "canceled";
  request_id: string;
  status_url: string;
  cancel_url: string;
}

/**
 * Higgsfield official API adapter (async queue).
 * Auth: Authorization: Key {apiKey}:{apiSecret}
 * Uses the v1 DOP endpoint with optional motion presets.
 * Supports dop-lite, dop-turbo (default), dop-preview variants.
 */
export class HiggsFieldAdapter implements VideoAdapter {
  readonly modelId: string;
  private readonly dopModel: string;
  private readonly authHeader: string;

  constructor(
    modelId = "higgsfield",
    apiKey = config.ai.higgsfieldApiKey ?? "",
    apiSecret = config.ai.higgsfieldApiSecret ?? "",
  ) {
    this.modelId = modelId;
    this.dopModel = DOP_MODEL[modelId] ?? "dop-turbo";
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
    type MotionEntry = { id: string; strength?: number };
    const motions = input.modelSettings?.motions as MotionEntry[] | undefined;

    const enhancePrompt = (input.modelSettings?.enhance_prompt as boolean | undefined) ?? true;
    const seed = (input.modelSettings?.seed as number | null | undefined) ?? undefined;

    const body: Record<string, unknown> = {
      model: this.dopModel,
      prompt: input.prompt,
      enhance_prompt: enhancePrompt,
      ...(seed != null ? { seed } : {}),
      ...(input.imageUrl
        ? { input_images: [{ type: "image_url", image_url: input.imageUrl }] }
        : {}),
      ...(motions?.length ? { motions } : {}),
    };

    const res = await fetchWithLog(`${HIGGSFIELD_API}/v1/image2video/dop`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ params: body }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as HiggsFieldStatus;
    logger.info({ data }, `Response from dop image to image generation`);
    return data.request_id;
  }

  async poll(requestId: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${HIGGSFIELD_API}/requests/${requestId}/status`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield poll failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as HiggsFieldStatus;

    if (data.status === "failed" || data.status === "nsfw" || data.status === "canceled") {
      throw new Error(`Higgsfield generation failed: ${JSON.stringify(data)}`);
    }
    if (data.status !== "completed") return null;

    const url = data.status_url;
    if (!url)
      throw new Error(`Higgsfield: no video URL in completed generation: ${JSON.stringify(data)}`);
    return { url, filename: "higgsfield.mp4" };
  }
}
