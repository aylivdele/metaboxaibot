import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";
import { logger } from "../../logger.js";

const HIGGSFIELD_API = "https://cloud.higgsfield.ai";

/** Response from POST /higgsfield-ai/soul/character */
interface SubmitResponse {
  request_id: string;
  status: string;
  status_url?: string;
  cancel_url?: string;
}

/** Response from GET status_url */
interface PollResponse {
  status: "queued" | "in_progress" | "nsfw" | "failed" | "completed" | "canceled";
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  /** Image results — exact shape TBD, handle multiple possible formats. */
  images?: Array<{ url: string; width?: number; height?: number }>;
  results?: null | { url?: string };
  image?: { url: string };
}

/**
 * Higgsfield Soul image adapter — async generation with Soul ID characters.
 * Uses Higgsfield Cloud API directly.
 * Auth: hf-api-key / hf-secret headers.
 */
export class HiggsFieldSoulImageAdapter implements ImageAdapter {
  readonly modelId = "higgsfield-soul";
  readonly isAsync = true;

  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    apiKey = config.ai.higgsfieldApiKey ?? "",
    apiSecret = config.ai.higgsfieldApiSecret ?? "",
  ) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private headers() {
    return {
      "hf-api-key": this.apiKey,
      "hf-secret": this.apiSecret,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async submit(input: ImageInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const customRefId = ms.custom_reference_id as string | undefined;
    if (!customRefId) throw new Error("custom_reference_id is required for Higgsfield Soul");

    const customRefStrength = (ms.custom_reference_strength as number | undefined) ?? 1;
    const aspectRatio = (input.aspectRatio || ms.aspect_ratio || "4:3") as string;
    const resolution = (ms.resolution as string | undefined) ?? "720p";
    const batchSize = (ms.batch_size as number | undefined) ?? 1;
    const enhancePrompt = (ms.enhance_prompt as boolean | undefined) ?? true;
    const seed = (ms.seed as number | null | undefined) ?? undefined;
    const styleId = (ms.style_id as string | null | undefined) ?? undefined;
    const styleStrength = (ms.style_strength as number | undefined) ?? 1;
    const imageRefUrl = input.mediaInputs?.edit?.[0] ?? input.imageUrl;

    const body: Record<string, unknown> = {
      custom_reference_id: customRefId,
      custom_reference_strength: customRefStrength,
      prompt: input.prompt,
      aspect_ratio: aspectRatio,
      resolution,
      batch_size: batchSize,
      enhance_prompt: enhancePrompt,
      ...(seed != null ? { seed } : {}),
      ...(styleId ? { style_id: styleId } : {}),
      ...(styleId ? { style_strength: styleStrength } : {}),
      ...(imageRefUrl ? { image_reference_url: imageRefUrl } : {}),
    };

    logger.info({ body }, "Higgsfield Soul submit request");

    const res = await fetchWithLog(`${HIGGSFIELD_API}/higgsfield-ai/soul/character`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield Soul submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as SubmitResponse;
    logger.info({ data }, "Higgsfield Soul submit response");

    if (!data.request_id) {
      throw new Error(`Higgsfield Soul: no request_id in response: ${JSON.stringify(data)}`);
    }

    const statusUrl = data.status_url ?? `${HIGGSFIELD_API}/requests/${data.request_id}/status`;
    return statusUrl;
  }

  async poll(statusUrl: string): Promise<ImageResult | null> {
    const res = await fetchWithLog(statusUrl, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield Soul poll failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as PollResponse;
    logger.info({ data }, "Higgsfield Soul poll response");

    if (data.status === "failed" || data.status === "nsfw" || data.status === "canceled") {
      throw new Error(`Higgsfield Soul generation ${data.status}: ${JSON.stringify(data)}`);
    }
    if (data.status !== "completed") return null;

    // Try multiple response shapes to find the image URL
    const url = data.images?.[0]?.url ?? data.image?.url ?? data.results?.url;

    if (!url) {
      throw new Error(
        `Higgsfield Soul: no image URL in completed response: ${JSON.stringify(data)}`,
      );
    }

    return {
      url,
      filename: "higgsfield-soul.png",
      contentType: "image/png",
      width: data.images?.[0]?.width,
      height: data.images?.[0]?.height,
    };
  }
}
