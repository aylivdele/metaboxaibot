import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
const SUBMIT_PATH = "/services/aigc/video-generation/video-synthesis";

const T2V_MODEL = "wan2.6-t2v";
const I2V_MODEL = "wan2.6-i2v";

/**
 * Size strings for text-to-video (T2V) — resolution tier × aspect ratio → "W*H".
 * Image-to-video uses a plain "resolution" keyword (720P / 1080P) since
 * the output aspect ratio is determined by the input image.
 */
const T2V_SIZE_MAP: Record<string, Record<string, string>> = {
  "720P": {
    "16:9": "1280*720",
    "9:16": "720*1280",
    "1:1": "960*960",
    "4:3": "1088*832",
    "3:4": "832*1088",
  },
  "1080P": {
    "16:9": "1920*1080",
    "9:16": "1080*1920",
    "1:1": "1440*1440",
    "4:3": "1632*1248",
    "3:4": "1248*1632",
  },
};

interface DashScopeSubmitResponse {
  output: { task_id: string; task_status: string };
  request_id?: string;
  code?: string;
  message?: string;
}

interface DashScopePollResponse {
  output: {
    task_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | string;
    video_url?: string;
    message?: string;
  };
}

/**
 * Alibaba DashScope adapter for Wan 2.6 video generation.
 * Automatically selects:
 *   - wan2.6-t2v  when no image is attached (text-to-video)
 *   - wan2.6-i2v  when an image is attached (image-to-video)
 * Docs: https://www.alibabacloud.com/help/en/model-studio/developer-reference/wan2-6-api
 */
export class AlibabaVideoAdapter implements VideoAdapter {
  constructor(readonly modelId: string) {}

  private get apiKey(): string {
    const key = config.ai.alibaba;
    if (!key) throw new Error("ALIBABA_API_KEY not configured");
    return key;
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const imageUrl = input.mediaInputs?.first_frame?.[0] ?? input.imageUrl;
    const isI2V = !!imageUrl;
    const dashscopeModel = isI2V ? I2V_MODEL : T2V_MODEL;

    const resolution = (ms.resolution as string | undefined) ?? "720P";
    const duration = (ms.duration as number | undefined) ?? input.duration ?? 5;

    const apiInput: Record<string, unknown> = { prompt: input.prompt };
    if (isI2V) apiInput.img_url = imageUrl;
    if (ms.negative_prompt) apiInput.negative_prompt = ms.negative_prompt;

    const parameters: Record<string, unknown> = { duration };

    if (isI2V) {
      // I2V uses a resolution tier keyword; aspect ratio comes from the input image
      parameters.resolution = resolution;
    } else {
      // T2V uses an exact pixel dimension string (resolution × aspect ratio)
      const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "16:9";
      const size = T2V_SIZE_MAP[resolution]?.[aspectRatio] ?? T2V_SIZE_MAP["720P"]["16:9"];
      parameters.size = size;
    }

    if (ms.prompt_extend !== undefined) parameters.prompt_extend = ms.prompt_extend;
    if (ms.seed != null) parameters.seed = ms.seed;

    const body = { model: dashscopeModel, input: apiInput, parameters };

    const resp = await fetchWithLog(`${DASHSCOPE_BASE}${SUBMIT_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Alibaba DashScope error ${resp.status}: ${txt}`);
    }

    const data = (await resp.json()) as DashScopeSubmitResponse;
    if (data.code) throw new Error(`Alibaba DashScope error: ${data.code} — ${data.message}`);
    return data.output.task_id;
  }

  async poll(taskId: string): Promise<VideoResult | null> {
    const resp = await fetchWithLog(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!resp.ok) throw new Error(`Alibaba poll error ${resp.status}`);

    const data = (await resp.json()) as DashScopePollResponse;
    const { task_status, video_url, message } = data.output;

    if (task_status === "FAILED") {
      throw new Error(`Alibaba Wan generation failed: ${message ?? "unknown error"}`);
    }
    if (task_status !== "SUCCEEDED") return null;
    if (!video_url) throw new Error("Alibaba Wan: no video URL in result");

    return { url: video_url, filename: "wan.mp4" };
  }
}
