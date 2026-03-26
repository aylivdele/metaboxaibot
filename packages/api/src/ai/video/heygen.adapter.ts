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
 *   creates avatar group, polls until ready, then generates via talking_photo character type
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
   * Full flow: upload image → create avatar group → poll until ready → return talking_photo_id.
   */
  private async createTalkingPhotoId(
    s3Key: string | undefined,
    fallbackUrl: string,
  ): Promise<string> {
    // 1. Resolve fresh URL and download image
    const imageUrl = s3Key
      ? ((await getFileUrl(s3Key).catch(() => null)) ?? fallbackUrl)
      : fallbackUrl;
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image for HeyGen upload: ${imgRes.status}`);
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

    // 2. Upload asset (raw binary body required by HeyGen)
    const uploadRes = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": contentType },
      body: imgBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { image_key?: string } };
    const imageKey = uploadData.data?.image_key;
    if (!imageKey) throw new Error("HeyGen: no image_key in asset upload response");

    // 3. Create avatar group from uploaded image
    const createRes = await fetch(`${HEYGEN_API}/v2/photo_avatar/avatar_group/create`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ name: `avatar_${Date.now()}`, image_key: imageKey }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`HeyGen avatar group create failed: ${createRes.status} ${text}`);
    }
    const createData = (await createRes.json()) as { data?: { id?: string; status?: string } };
    const groupId = createData.data?.id;
    if (!groupId) throw new Error("HeyGen: no group id in avatar group create response");

    // 4. Poll until avatar group is ready (status: "completed")
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${HEYGEN_API}/v2/photo_avatar/avatar_group/${groupId}`, {
        headers: { "X-Api-Key": this.apiKey },
      });
      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json()) as {
        data?: { status?: string; avatar_list?: Array<{ id: string }> };
      };
      const status = pollData.data?.status;
      if (status === "completed") {
        // Use first look id if available, else fall back to groupId
        return pollData.data?.avatar_list?.[0]?.id ?? groupId;
      }
      if (status === "failed") throw new Error("HeyGen: avatar group processing failed");
    }
    throw new Error("HeyGen: avatar group did not become ready in time");
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
      const talkingPhotoId = await this.createTalkingPhotoId(avatarPhotoS3Key, avatarPhotoUrl);

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
