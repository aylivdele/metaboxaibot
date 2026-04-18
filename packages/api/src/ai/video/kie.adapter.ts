import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";
import { uploadFileUrl } from "../../utils/kie-upload.js";

const KIE_BASE = "https://api.kie.ai";

interface KieSubmitResponse {
  code: number;
  msg: string;
  data?: { taskId?: string };
}

interface KieTaskResponse {
  code: number;
  msg: string;
  data?: {
    taskId: string;
    model: string;
    state: "waiting" | "queuing" | "generating" | "success" | "fail";
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
}

/** Model ID → KIE API model name mapping. */
const MODEL_MAP: Record<string, { t2v: string; i2v: string }> = {
  "grok-imagine": {
    t2v: "grok-imagine/text-to-video",
    i2v: "grok-imagine/image-to-video",
  },
};

/**
 * KIE adapter for Grok Imagine video generation.
 *
 * Endpoints:
 *  - POST /api/v1/jobs/createTask   — submit generation task
 *  - GET  /api/v1/jobs/recordInfo?taskId=X — poll task status
 *
 * i2v accepts up to 7 reference images via image_urls.
 * Images from S3/Telegram are re-uploaded through KIE's file upload API
 * to ensure KIE can access them (presigned URLs may expire or be blocked).
 */
export class KieVideoAdapter implements VideoAdapter {
  constructor(readonly modelId: string) {}

  private get apiKey(): string {
    const key = config.ai.kie;
    if (!key) throw new Error("KIE_API_KEY not configured");
    return key;
  }

  private get jsonHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const mi = input.mediaInputs ?? {};

    // Collect all reference images (up to 7)
    const refImages = mi.ref_images ?? [];
    const legacyImage = input.imageUrl;
    const imageUrls = refImages.length > 0 ? refImages : legacyImage ? [legacyImage] : [];
    const isI2V = imageUrls.length > 0;

    const mapping = MODEL_MAP[this.modelId];
    if (!mapping) throw new Error(`KIE: unknown model ${this.modelId}`);
    const model = isI2V ? mapping.i2v : mapping.t2v;

    const inputPayload: Record<string, unknown> = {
      prompt: input.prompt,
    };

    // aspect_ratio
    const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "16:9";
    inputPayload.aspect_ratio = aspectRatio;

    // duration (6–30)
    const duration = (ms.duration as number | undefined) ?? input.duration ?? 6;
    inputPayload.duration = duration;

    // resolution
    const resolution = (ms.resolution as string | undefined) ?? "480p";
    inputPayload.resolution = resolution;

    // mode (t2v: fun/normal/spicy; i2v: fun/normal only — spicy excluded)
    const mode = (ms.mode as string | undefined) ?? "normal";
    inputPayload.mode = mode;

    // nsfw_checker always off
    inputPayload.nsfw_checker = false;

    // i2v: re-upload images through KIE file upload API and pass public URLs
    if (isI2V) {
      const uploadedUrls = await Promise.all(
        imageUrls.slice(0, 7).map((url) => uploadFileUrl(this.apiKey, url)),
      );
      inputPayload.image_urls = uploadedUrls;
    }

    const body = { model, input: inputPayload };

    const resp = await fetchWithLog(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`KIE submit error ${resp.status}: ${txt}`);
    }

    const data = (await resp.json()) as KieSubmitResponse;
    if (data.code !== 200 || !data.data?.taskId) {
      throw new Error(`KIE submit failed: ${data.code} — ${data.msg}`);
    }
    return data.data.taskId;
  }

  async poll(taskId: string): Promise<VideoResult | null> {
    const resp = await fetchWithLog(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );

    if (!resp.ok) throw new Error(`KIE poll error ${resp.status}`);

    const data = (await resp.json()) as KieTaskResponse;
    if (data.code !== 200 || !data.data) {
      throw new Error(`KIE poll failed: ${data.code} — ${data.msg}`);
    }

    const task = data.data;

    if (task.state === "fail") {
      throw new Error(
        `KIE Grok Imagine generation failed: ${task.failCode ?? ""} ${task.failMsg ?? "unknown error"}`,
      );
    }
    if (task.state !== "success") return null;

    // resultJson: '{"resultUrls":["https://..."]}'
    if (!task.resultJson) throw new Error("KIE: no resultJson in completed task");
    const result = JSON.parse(task.resultJson) as { resultUrls?: string[] };
    const url = result.resultUrls?.[0];
    if (!url) throw new Error("KIE: no video URL in resultJson");

    return { url, filename: "grok-imagine.mp4" };
  }
}
