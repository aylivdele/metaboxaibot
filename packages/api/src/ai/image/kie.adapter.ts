import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
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

/**
 * KIE adapter for Grok Imagine image generation.
 *
 * Endpoints:
 *  - POST /api/v1/jobs/createTask   — submit generation task
 *  - GET  /api/v1/jobs/recordInfo?taskId=X — poll task status
 *
 * Supports text-to-image and image-to-image (via image_urls).
 * Input images are re-uploaded through KIE's file upload API.
 */
export class KieImageAdapter implements ImageAdapter {
  readonly modelId = "grok-imagine-image";
  readonly isAsync = true;

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

  async submit(input: ImageInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const mi = input.mediaInputs ?? {};

    const editImages = mi.edit ?? [];
    const imageUrls = editImages.length > 0 ? editImages : input.imageUrl ? [input.imageUrl] : [];
    const isI2I = imageUrls.length > 0;

    const inputPayload: Record<string, unknown> = {
      prompt: input.prompt,
      nsfw_checker: false,
    };

    // aspect_ratio
    const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "1:1";
    inputPayload.aspect_ratio = aspectRatio;

    // enable_pro (quality mode)
    const enablePro = (ms.enable_pro as boolean | undefined) ?? false;
    inputPayload.enable_pro = enablePro;

    // i2i: re-upload images through KIE file upload API
    if (isI2I) {
      const uploadedUrls = await Promise.all(
        imageUrls.map((url) => uploadFileUrl(this.apiKey, url)),
      );
      inputPayload.image_urls = uploadedUrls;
    }

    const body = {
      model: "grok-imagine/text-to-image",
      input: inputPayload,
    };

    const resp = await fetchWithLog(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`KIE image submit error ${resp.status}: ${txt}`);
    }

    const data = (await resp.json()) as KieSubmitResponse;
    if (data.code !== 200 || !data.data?.taskId) {
      throw new Error(`KIE image submit failed: ${data.code} — ${data.msg}`);
    }
    return data.data.taskId;
  }

  async poll(taskId: string): Promise<ImageResult[] | null> {
    const resp = await fetchWithLog(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );

    if (!resp.ok) throw new Error(`KIE image poll error ${resp.status}`);

    const data = (await resp.json()) as KieTaskResponse;
    if (data.code !== 200 || !data.data) {
      throw new Error(`KIE image poll failed: ${data.code} — ${data.msg}`);
    }

    const task = data.data;

    if (task.state === "fail") {
      throw new Error(
        `KIE Grok Imagine image generation failed: ${task.failCode ?? ""} ${task.failMsg ?? "unknown error"}`,
      );
    }
    if (task.state !== "success") return null;

    if (!task.resultJson) throw new Error("KIE: no resultJson in completed image task");
    const result = JSON.parse(task.resultJson) as { resultUrls?: string[] };
    const urls = result.resultUrls;
    if (!urls?.length) throw new Error("KIE: no image URLs in resultJson");

    return urls.map((url, i) => ({
      url,
      filename: `grok-imagine-${i}.jpg`,
    }));
  }
}
