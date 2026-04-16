import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const HIGGSFIELD_API = "https://platform.higgsfield.ai";

interface CreateResponse {
  id: string;
  name: string;
  status: string;
}

interface SoulIdStatusResponse {
  id: string;
  name: string;
  status: "not_ready" | "queued" | "in_progress" | "completed" | "failed";
  preview_url?: string;
}

/**
 * Higgsfield Soul adapter for character (Soul ID) creation.
 * Uses the Higgsfield platform API directly — NOT fal.ai.
 *
 * Workflow: create(name, imageUrls) → poll(externalId) until ready.
 */
export class HiggsFieldSoulAdapter {
  readonly provider = "higgsfield_soul";
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

  /** Create a Soul ID from an array of image URLs. */
  async create(name: string, imageUrls: string[]): Promise<{ externalId: string }> {
    const body = {
      name,
      input_images: imageUrls.map((url) => ({
        type: "image_url" as const,
        image_url: url,
      })),
    };

    const res = await fetchWithLog(`${HIGGSFIELD_API}/v1/custom-references`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield Soul create failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as CreateResponse;
    if (!data.id) {
      throw new Error(`Higgsfield Soul: no ID in response: ${JSON.stringify(data)}`);
    }
    return { externalId: data.id };
  }

  /** Poll Soul ID creation status. */
  async poll(
    externalId: string,
  ): Promise<{ status: "ready" | "processing" | "failed"; previewUrl?: string }> {
    const res = await fetchWithLog(`${HIGGSFIELD_API}/v1/custom-references/${externalId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Higgsfield Soul poll failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as SoulIdStatusResponse;

    if (data.status === "completed") {
      return { status: "ready", previewUrl: data.preview_url };
    }
    if (data.status === "failed") {
      return { status: "failed" };
    }
    return { status: "processing" };
  }
}
