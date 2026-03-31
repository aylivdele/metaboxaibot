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

/** Response from POST /v1/image2video/dop — job set containing one or more jobs. */
interface SubmitResponse {
  id: string; // job set ID
  jobs: Array<{
    id: string; // individual job ID — use this for polling
    status: string;
    results: null | { url?: string; raw?: { url?: string } };
  }>;
}

/** Response from GET /requests/{jobId}/status */
interface PollResponse {
  id: string;
  status: "queued" | "in_progress" | "nsfw" | "failed" | "completed" | "canceled";
  results: null | { url?: string; raw?: { url?: string } };
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

    const data = (await res.json()) as SubmitResponse;
    logger.info({ data }, "Higgsfield submit response");

    const jobId = data.jobs?.[0]?.id;
    if (!jobId)
      throw new Error(`Higgsfield: no job ID in submit response: ${JSON.stringify(data)}`);
    return jobId;
  }

  async poll(jobId: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${HIGGSFIELD_API}/requests/${jobId}/status`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield poll failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as PollResponse;

    if (data.status === "failed" || data.status === "nsfw" || data.status === "canceled") {
      throw new Error(`Higgsfield generation ${data.status}: ${JSON.stringify(data)}`);
    }
    if (data.status !== "completed") return null;

    const url = data.results?.url ?? data.results?.raw?.url;
    if (!url) throw new Error(`Higgsfield: no video URL in completed job: ${JSON.stringify(data)}`);
    return { url, filename: "higgsfield.mp4" };
  }
}
