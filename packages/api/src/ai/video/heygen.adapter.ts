import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const HEYGEN_API = "https://api.heygen.com/v2";

interface HeyGenVideoStatus {
  data?: {
    status: string;
    video_url?: string;
    error?: string;
  };
}

/**
 * HeyGen talking-avatar adapter (REST API).
 * Uses a default avatar + TTS voice from the prompt text.
 */
export class HeyGenAdapter implements VideoAdapter {
  readonly modelId = "heygen";

  private readonly apiKey: string;
  /** Default avatar ID from HeyGen template library */
  private readonly avatarId: string;

  constructor(
    apiKey = config.ai.heygen ?? "",
    avatarId = config.ai.heygenAvatarId ?? "Angela-inblackskirt-20220820",
  ) {
    this.apiKey = apiKey;
    this.avatarId = avatarId;
  }

  private headers() {
    return {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const body = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: this.avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: input.prompt,
            voice_id: "en-US-JennyNeural",
          },
          background: { type: "color", value: "#FFFFFF" },
        },
      ],
      dimension: { width: 1280, height: 720 },
    };

    const res = await fetch(`${HEYGEN_API}/video/generate`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HeyGen submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { data?: { video_id: string } };
    const videoId = data.data?.video_id;
    if (!videoId) throw new Error("HeyGen: no video_id in response");
    return videoId;
  }

  async poll(videoId: string): Promise<VideoResult | null> {
    const res = await fetch(`${HEYGEN_API}/video_status.get?video_id=${videoId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HeyGen poll failed: ${res.status} ${text}`);
    }

    const result = (await res.json()) as HeyGenVideoStatus;
    const data = result.data;

    if (!data) throw new Error("HeyGen: empty status response");
    if (data.status === "failed")
      throw new Error(`HeyGen video failed: ${data.error ?? "unknown"}`);
    if (data.status !== "completed") return null;

    const url = data.video_url;
    if (!url) throw new Error("HeyGen: no video_url in completed status");
    return { url, filename: "heygen.mp4" };
  }
}
