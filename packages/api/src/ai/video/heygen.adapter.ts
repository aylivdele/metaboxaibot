import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { getFileUrl } from "../../services/s3.service.js";

const HEYGEN_API = "https://api.heygen.com";
const HEYGEN_UPLOAD = "https://upload.heygen.com";

interface HeyGenVideoStatus {
  data?: {
    status: string;
    video_url?: string;
    error?: string;
  };
}

/**
 * HeyGen talking-avatar adapter (REST API).
 *
 * Uses a default avatar + TTS voice from the prompt text, unless:
 * - modelSettings.avatar_id is set → uses that official avatar
 * - modelSettings.avatar_photo_url is set → uploads photo to HeyGen assets,
 *   then uses Avatar IV endpoint (POST /v2/video/avatar-iv)
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

  private static readonly DIMS: Record<string, { width: number; height: number }> = {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 720, height: 720 },
  };

  /**
   * Upload an image to HeyGen Asset API.
   * Accepts an s3Key (preferred — regenerates a fresh presigned URL right before fetching)
   * or a fallback URL. Returns the image_key used in Avatar IV requests.
   */
  private async uploadPhotoToHeygen(
    s3Key: string | undefined,
    fallbackUrl: string,
  ): Promise<string> {
    // Regenerate a fresh presigned URL from S3 right before fetching to avoid expiry issues
    const imageUrl = s3Key
      ? ((await getFileUrl(s3Key).catch(() => null)) ?? fallbackUrl)
      : fallbackUrl;
    // Download the image first
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image for HeyGen upload: ${imgRes.status}`);
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

    // HeyGen upload API expects raw binary body with the image Content-Type (not multipart)
    const res = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": contentType },
      body: imgBuffer,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HeyGen asset upload failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { data?: { id?: string; image_key?: string } };
    const imageKey = data.data?.image_key ?? data.data?.id;
    if (!imageKey) throw new Error("HeyGen: no image_key in asset upload response");
    return imageKey;
  }

  /** Resolve a fresh URL: regenerate from s3Key if available, else use stored URL. */
  private static async freshUrl(
    s3KeySetting: unknown,
    urlSetting: unknown,
  ): Promise<string | undefined> {
    const s3Key = s3KeySetting as string | undefined;
    const url = urlSetting as string | undefined;
    if (s3Key) {
      const fresh = await getFileUrl(s3Key).catch(() => null);
      if (fresh) return fresh;
    }
    return url || undefined;
  }

  async submit(input: VideoInput): Promise<string> {
    const voiceUrl = await HeyGenAdapter.freshUrl(
      input.modelSettings?.voice_s3key,
      input.modelSettings?.voice_url,
    );
    const voiceId = (input.modelSettings?.voice_id as string | undefined) ?? "en-US-JennyNeural";
    const bgColor = (input.modelSettings?.background_color as string | undefined) ?? "#FFFFFF";
    const dimension = HeyGenAdapter.DIMS[input.aspectRatio ?? "16:9"] ?? HeyGenAdapter.DIMS["16:9"];

    const avatarPhotoUrl = await HeyGenAdapter.freshUrl(
      input.modelSettings?.avatar_photo_s3key,
      input.modelSettings?.avatar_photo_url,
    );
    const avatarId = (input.modelSettings?.avatar_id as string | undefined) || this.avatarId;

    const voice = voiceUrl
      ? { type: "audio", audio_url: voiceUrl }
      : { type: "text", input_text: input.prompt, voice_id: voiceId };

    // Talking Photo endpoint: upload photo asset, then use talking_photo character type
    if (avatarPhotoUrl) {
      const avatarPhotoS3Key = input.modelSettings?.avatar_photo_s3key as string | undefined;
      const talkingPhotoId = await this.uploadPhotoToHeygen(avatarPhotoS3Key, avatarPhotoUrl);

      const body = {
        video_inputs: [
          {
            character: {
              type: "talking_photo",
              talking_photo_id: talkingPhotoId,
            },
            voice,
            background: { type: "color", value: bgColor },
          },
        ],
        dimension,
      };

      const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HeyGen Talking Photo submit failed: ${res.status} ${text}`);
      }

      const data = (await res.json()) as { data?: { video_id: string } };
      const videoId = data.data?.video_id;
      if (!videoId) throw new Error("HeyGen: no video_id in Talking Photo response");
      return videoId;
    }

    // Standard avatar endpoint
    const body = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "normal",
          },
          voice,
          background: { type: "color", value: bgColor },
        },
      ],
      dimension,
    };

    const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
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
    const res = await fetch(`${HEYGEN_API}/v2/video_status.get?video_id=${videoId}`, {
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
