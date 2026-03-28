import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const MINIMAX_API_BASE = "https://api.minimax.io/v1";

/** Maps our internal model IDs to MiniMax API model names. */
const MODEL_MAP: Record<string, string> = {
  minimax: "T2V-01",
  hailuo: "MiniMax-Hailuo-2.3",
  "hailuo-fast": "MiniMax-Hailuo-2.3-Fast",
};

/** Valid resolutions per model. */
const SUPPORTED_RESOLUTIONS: Record<string, string[]> = {
  minimax: ["720P"],
  hailuo: ["768P", "1080P"],
  "hailuo-fast": ["768P", "1080P"],
};

interface MinimaxSubmitResponse {
  task_id?: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface MinimaxPollResponse {
  /** Lowercase: "processing" | "success" | "failed" */
  status: string;
  file_id?: string;
  error_message?: string;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

interface MinimaxFileResponse {
  file: {
    file_id: string;
    download_url: string;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

/**
 * MiniMax native video generation adapter.
 * Covers "minimax" (T2V-01), "hailuo" (MiniMax-Hailuo-2.3), and "hailuo-fast" (MiniMax-Hailuo-2.3-Fast).
 * Note: hailuo-fast is I2V only — first_frame_image is required.
 * Docs: https://platform.minimax.io/docs/guides/video-generation
 */
export class MinimaxVideoAdapter implements VideoAdapter {
  constructor(readonly modelId: string) {}

  private get apiKey(): string {
    const key = config.ai.minimax;
    if (!key) throw new Error("MINIMAX_API_KEY not configured");
    return key;
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const model = MODEL_MAP[this.modelId] ?? "T2V-01";

    // Pick resolution: prefer modelSettings, then fall back to best supported
    const supportedRes = SUPPORTED_RESOLUTIONS[this.modelId] ?? ["720P"];
    const defaultRes = supportedRes[supportedRes.length - 1]; // prefer highest
    const resolution = (ms.resolution as string | undefined) ?? defaultRes;

    const duration = (ms.duration as number | undefined) ?? input.duration ?? 6;

    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      duration,
      resolution,
      prompt_optimizer: true,
    };

    if (input.imageUrl) {
      body.first_frame_image = input.imageUrl;
    }

    const resp = await fetchWithLog(`${MINIMAX_API_BASE}/video_generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`MiniMax API error ${resp.status}: ${txt}`);
    }

    const data = (await resp.json()) as MinimaxSubmitResponse;
    if (data.base_resp.status_code !== 0) {
      throw new Error(`MiniMax API error: ${data.base_resp.status_msg}`);
    }
    if (!data.task_id) throw new Error("MiniMax: no task_id in response");
    return data.task_id;
  }

  async poll(taskId: string): Promise<VideoResult | null> {
    const resp = await fetchWithLog(
      `${MINIMAX_API_BASE}/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    if (!resp.ok) throw new Error(`MiniMax poll error ${resp.status}`);

    const data = (await resp.json()) as MinimaxPollResponse;
    const status = data.status?.toLowerCase();

    if (status === "failed" || status === "fail") {
      throw new Error(`MiniMax generation failed: ${data.error_message ?? "unknown error"}`);
    }
    if (status !== "success") return null;
    if (!data.file_id) throw new Error("MiniMax: no file_id in success response");

    // Retrieve actual download URL from file ID
    const fileResp = await fetchWithLog(
      `${MINIMAX_API_BASE}/files/retrieve?file_id=${encodeURIComponent(data.file_id)}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    if (!fileResp.ok) throw new Error(`MiniMax file retrieve error ${fileResp.status}`);

    const fileData = (await fileResp.json()) as MinimaxFileResponse;
    const url = fileData.file?.download_url;
    if (!url) throw new Error("MiniMax: no download_url in file response");

    return { url, filename: `${this.modelId}.mp4` };
  }
}
