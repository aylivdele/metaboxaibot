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

/** Grok Imagine: separate t2v/i2v endpoints. */
const GROK_MODEL_MAP: Record<string, { t2v: string; i2v: string }> = {
  "grok-imagine": {
    t2v: "grok-imagine/text-to-video",
    i2v: "grok-imagine/image-to-video",
  },
};

/** Seedance 2.0: single model name for all scenarios. */
const SEEDANCE_MODEL_MAP: Record<string, string> = {
  "seedance-2": "bytedance/seedance-2",
  "seedance-2-fast": "bytedance/seedance-2-fast",
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

    const seedanceModel = SEEDANCE_MODEL_MAP[this.modelId];
    const inputPayload: Record<string, unknown> = {
      prompt: input.prompt,
    };

    let model: string;

    if (seedanceModel) {
      // ── Seedance 2.0 / 2.0 Fast ────────────────────────────────────────────
      model = seedanceModel;

      const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "16:9";
      inputPayload.aspect_ratio = aspectRatio === "auto" ? "adaptive" : aspectRatio;

      const duration = (ms.duration as number | undefined) ?? input.duration ?? 5;
      inputPayload.duration = duration;

      const resolution = (ms.resolution as string | undefined) ?? "720p";
      inputPayload.resolution = resolution;

      inputPayload.generate_audio = ms.generate_audio !== undefined ? ms.generate_audio : true;
      inputPayload.web_search = false;
      inputPayload.nsfw_checker = false;

      // first_frame / last_frame
      const firstFrame = mi.first_frame?.[0] ?? input.imageUrl;
      const lastFrame = mi.last_frame?.[0];
      if (firstFrame) inputPayload.first_frame_url = await uploadFileUrl(this.apiKey, firstFrame);
      if (lastFrame) inputPayload.last_frame_url = await uploadFileUrl(this.apiKey, lastFrame);

      // Reference slots (multimodal reference-to-video)
      const refImages = mi.ref_images ?? [];
      const refVideos = mi.ref_videos ?? [];
      const refAudios = mi.ref_audios ?? [];
      if (refImages.length) {
        inputPayload.reference_image_urls = await Promise.all(
          refImages.slice(0, 9).map((url) => uploadFileUrl(this.apiKey, url)),
        );
      }
      if (refVideos.length) {
        inputPayload.reference_video_urls = await Promise.all(
          refVideos.slice(0, 3).map((url) => uploadFileUrl(this.apiKey, url)),
        );
      }
      if (refAudios.length) {
        inputPayload.reference_audio_urls = await Promise.all(
          refAudios.slice(0, 3).map((url) => uploadFileUrl(this.apiKey, url)),
        );
      }
    } else {
      // ── Grok Imagine ────────────────────────────────────────────────────────
      const grokMapping = GROK_MODEL_MAP[this.modelId];
      if (!grokMapping) throw new Error(`KIE: unknown model ${this.modelId}`);

      const refImages = mi.ref_images ?? [];
      const legacyImage = input.imageUrl;
      const imageUrls = refImages.length > 0 ? refImages : legacyImage ? [legacyImage] : [];
      const isI2V = imageUrls.length > 0;
      model = isI2V ? grokMapping.i2v : grokMapping.t2v;

      const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "16:9";
      inputPayload.aspect_ratio = aspectRatio;
      inputPayload.duration = (ms.duration as number | undefined) ?? input.duration ?? 6;
      inputPayload.resolution = (ms.resolution as string | undefined) ?? "480p";
      inputPayload.mode = (ms.mode as string | undefined) ?? "normal";
      inputPayload.nsfw_checker = false;

      if (isI2V) {
        const uploadedUrls = await Promise.all(
          imageUrls.slice(0, 7).map((url) => uploadFileUrl(this.apiKey, url)),
        );
        inputPayload.image_urls = uploadedUrls;
      }
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
        `KIE ${this.modelId} generation failed: ${task.failCode ?? ""} ${task.failMsg ?? "unknown error"}`,
      );
    }
    if (task.state !== "success") return null;

    // resultJson: '{"resultUrls":["https://..."]}'
    if (!task.resultJson) throw new Error("KIE: no resultJson in completed task");
    const result = JSON.parse(task.resultJson) as { resultUrls?: string[] };
    const url = result.resultUrls?.[0];
    if (!url) throw new Error("KIE: no video URL in resultJson");

    return { url, filename: `${this.modelId}.mp4` };
  }
}
