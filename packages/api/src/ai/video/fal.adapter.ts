import { fal } from "@fal-ai/client";
import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

/**
 * FAL.ai video adapter — used for Kling, MiniMax, Pika, Hailuo.
 */
const FAL_ENDPOINTS: Record<string, string> = {
  kling: "fal-ai/kling-video/v1.6/standard/text-to-video",
  minimax: "fal-ai/minimax/video-01-live",
  pika: "fal-ai/pika-v2/text-to-video",
  hailuo: "fal-ai/hailuo-ai/video-01",
};

export class FalVideoAdapter implements VideoAdapter {
  constructor(
    readonly modelId: string,
    apiKey = config.ai.fal,
  ) {
    fal.config({ credentials: apiKey });
  }

  private get endpoint(): string {
    return FAL_ENDPOINTS[this.modelId] ?? `fal-ai/${this.modelId}`;
  }

  async submit(input: VideoInput): Promise<string> {
    const { request_id } = await fal.queue.submit(this.endpoint, {
      input: {
        prompt: input.prompt,
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        ...(input.duration ? { duration: input.duration } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      },
    });
    return request_id;
  }

  async poll(requestId: string): Promise<VideoResult | null> {
    const status = await fal.queue.status(this.endpoint, {
      requestId,
      logs: false,
    });

    if (status.status !== "COMPLETED") return null;

    const result = await fal.queue.result(this.endpoint, { requestId });
    const data = result.data as { video?: { url: string }; video_url?: string };
    const url = data.video?.url ?? data.video_url;
    if (!url) throw new Error(`FAL video: no URL in result for ${this.modelId}`);
    return { url, filename: `${this.modelId}.mp4` };
  }
}
