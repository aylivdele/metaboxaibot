import { fal } from "@fal-ai/client";
import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/** Text-to-video endpoint for each model. */
const FAL_ENDPOINTS: Record<string, string> = {
  kling: "fal-ai/kling-video/v3/standard/text-to-video",
  "kling-pro": "fal-ai/kling-video/v3/pro/text-to-video",
  pika: "fal-ai/pika/v2.2/text-to-video",
  seedance: "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
  "seedance-2": "bytedance/seedance-2.0/text-to-video",
  "seedance-2-fast": "bytedance/seedance-2.0/fast/text-to-video",
};

/** Image-to-video endpoint. Falls back to the T2V endpoint when absent. */
const FAL_I2V_ENDPOINTS: Record<string, string> = {
  kling: "fal-ai/kling-video/v3/standard/image-to-video",
  "kling-pro": "fal-ai/kling-video/v3/pro/image-to-video",
  seedance: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
  "seedance-2": "bytedance/seedance-2.0/image-to-video",
  "seedance-2-fast": "bytedance/seedance-2.0/fast/image-to-video",
  pika: "fal-ai/pika/v2.2/image-to-video",
};

/** Separator used to pack endpoint+requestId into a single opaque string. */
const SEP = "||";

export class FalVideoAdapter implements VideoAdapter {
  constructor(
    readonly modelId: string,
    apiKey = config.ai.fal,
  ) {
    fal.config({ credentials: apiKey });
  }

  private selectEndpoint(imageUrl: string | undefined): string {
    if (imageUrl && FAL_I2V_ENDPOINTS[this.modelId]) {
      return FAL_I2V_ENDPOINTS[this.modelId];
    }
    return FAL_ENDPOINTS[this.modelId] ?? `fal-ai/${this.modelId}`;
  }

  async submit(input: VideoInput): Promise<string> {
    const endpoint = this.selectEndpoint(input.imageUrl);
    const ms = input.modelSettings ?? {};
    const msExtras: Record<string, unknown> = {};
    if (ms.cfg_scale !== undefined) msExtras.cfg_scale = ms.cfg_scale;
    if (ms.negative_prompt) msExtras.negative_prompt = ms.negative_prompt;
    if (ms.generate_audio !== undefined) msExtras.generate_audio = ms.generate_audio;
    if (ms.resolution) msExtras.resolution = ms.resolution;
    if (ms.motion_strength !== undefined) msExtras.motion_strength = ms.motion_strength;
    if (ms.seed != null) msExtras.seed = ms.seed;
    const falInput = {
      prompt: input.prompt,
      ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
      ...(input.duration
        ? {
            duration: this.modelId.startsWith("seedance-2")
              ? String(input.duration)
              : input.duration,
          }
        : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...msExtras,
    };
    logCall(endpoint, "submit", falInput);
    const { request_id } = await fal.queue.submit(endpoint, { input: falInput });
    return `${endpoint}${SEP}${request_id}`;
  }

  async poll(providerJobId: string): Promise<VideoResult | null> {
    // Support legacy plain request_id format (pre-encoding) for backwards compat
    let endpoint: string;
    let requestId: string;
    if (providerJobId.includes(SEP)) {
      const sepIdx = providerJobId.lastIndexOf(SEP);
      endpoint = providerJobId.slice(0, sepIdx);
      requestId = providerJobId.slice(sepIdx + SEP.length);
    } else {
      endpoint = FAL_ENDPOINTS[this.modelId] ?? `fal-ai/${this.modelId}`;
      requestId = providerJobId;
    }

    logCall(this.modelId, "poll", { requestId, endpoint });

    const status = await fal.queue.status(endpoint, {
      requestId,
      logs: false,
    });

    if (status.status !== "COMPLETED") return null;

    const result = await fal.queue.result(endpoint, { requestId });
    const data = result.data as { video?: { url: string }; video_url?: string };
    const url = data.video?.url ?? data.video_url;
    if (!url) throw new Error(`FAL video: no URL in result for ${this.modelId}`);
    return { url, filename: `${this.modelId}.mp4` };
  }
}
