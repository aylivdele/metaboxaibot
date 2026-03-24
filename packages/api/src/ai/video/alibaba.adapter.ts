import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const DASHSCOPE_API_BASE = "https://dashscope.aliyuncs.com/api/v1";

/** Maps our model IDs to DashScope model names. */
const MODEL_MAP: Record<string, string> = {
  wan: "wan2.1-t2v-turbo",
};

/** Maps aspect ratios to DashScope video size strings. */
const SIZE_MAP: Record<string, string> = {
  "16:9": "1280*720",
  "9:16": "720*1280",
  "1:1": "720*720",
};

interface DashScopeSubmitResponse {
  output: {
    task_id: string;
    task_status: string;
  };
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
 * Alibaba DashScope adapter for Wan video generation.
 * Docs: https://help.aliyun.com/zh/dashscope/developer-reference/wan-api
 */
export class AlibabaVideoAdapter implements VideoAdapter {
  constructor(readonly modelId: string) {}

  async submit(input: VideoInput): Promise<string> {
    const apiKey = config.ai.alibaba;
    if (!apiKey) throw new Error("ALIBABA_API_KEY not configured");

    const ms = input.modelSettings ?? {};
    const dashscopeModel = MODEL_MAP[this.modelId] ?? "wan2.1-t2v-turbo";

    const aspectRatio = (ms.aspect_ratio as string | undefined) ?? input.aspectRatio ?? "16:9";
    const size = SIZE_MAP[aspectRatio] ?? "1280*720";
    const duration = (ms.duration as number | undefined) ?? input.duration ?? 5;

    const parameters: Record<string, unknown> = { size, duration };
    if (ms.resolution) parameters.resolution = ms.resolution;
    if (ms.negative_prompt) parameters.negative_prompt = ms.negative_prompt;
    if (ms.motion_strength !== undefined) parameters.motion_strength = ms.motion_strength;

    const body = {
      model: dashscopeModel,
      input: {
        prompt: input.prompt,
        ...(input.imageUrl ? { img_url: input.imageUrl } : {}),
      },
      parameters,
    };

    const resp = await fetch(`${DASHSCOPE_API_BASE}/services/aigc/video-generation/generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    const apiKey = config.ai.alibaba;
    if (!apiKey) throw new Error("ALIBABA_API_KEY not configured");

    const resp = await fetch(`${DASHSCOPE_API_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
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
