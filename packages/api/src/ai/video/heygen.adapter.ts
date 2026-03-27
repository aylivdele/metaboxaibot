import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { getFileUrl } from "../../services/s3.service.js";
import { logger } from "../../logger.js";

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
 * HeyGen talking-avatar adapter using POST /v2/videos.
 *
 * Avatar resolution priority:
 *  1. modelSettings.talking_photo_id → pre-created photo avatar (from async job), passed as avatar_id
 *  2. modelSettings.avatar_photo_url  → upload image now, use image_asset_id (no avatar group creation)
 *  3. modelSettings.avatar_id         → official HeyGen avatar
 *  4. default avatarId from config
 *
 * Voice resolution priority:
 *  1. modelSettings.voice_url / voice_s3key → audio_url (lip-sync)
 *  2. modelSettings.voice_id + prompt        → TTS script
 */
export class HeyGenAdapter implements VideoAdapter {
  readonly modelId = "heygen";

  private readonly apiKey: string;
  private readonly defaultAvatarId: string;

  constructor(
    apiKey = config.ai.heygen ?? "",
    defaultAvatarId = config.ai.heygenAvatarId ?? "Angela-inblackskirt-20220820",
  ) {
    this.apiKey = apiKey;
    this.defaultAvatarId = defaultAvatarId;
  }

  private get jsonHeaders() {
    return { "X-Api-Key": this.apiKey, "Content-Type": "application/json" };
  }

  /** Upload raw image to HeyGen asset storage. Returns image_key (used as image_asset_id). */
  private async uploadImageAsset(s3Key: string | undefined, fallbackUrl: string): Promise<string> {
    const imageUrl = s3Key
      ? ((await getFileUrl(s3Key).catch(() => null)) ?? fallbackUrl)
      : fallbackUrl;

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image for HeyGen upload: ${imgRes.status}`);
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

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
    return imageKey;
  }

  /** Resolve URL: try fresh presigned URL from S3 first, then fall back to stored URL. */
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
    const aspectRatio = input.aspectRatio ?? "16:9";

    // ── Avatar source ────────────────────────────────────────────────────────
    // const talkingPhotoId = input.modelSettings?.talking_photo_id as string | undefined;
    const avatarPhotoUrl = await HeyGenAdapter.freshUrl(
      input.modelSettings?.avatar_photo_s3key,
      input.modelSettings?.avatar_photo_url,
    );
    const avatarId = (input.modelSettings?.avatar_id as string | undefined) || this.defaultAvatarId;

    // ── Build flat /v2/videos body ───────────────────────────────────────────
    const body: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      background: { type: "color", value: bgColor },
      ...(voiceUrl ? { audio_url: voiceUrl } : { script: input.prompt, voice_id: voiceId }),
    };

    // if (talkingPhotoId) {
    //   // Pre-created photo avatar from async job — use directly as avatar_id
    //   body.avatar_id = talkingPhotoId;
    //   logger.info({ talkingPhotoId }, "HeyGen: using pre-created photo avatar");
    // } else
    if (avatarPhotoUrl) {
      // One-shot photo: upload now and use as image_asset_id
      const avatarPhotoS3Key = input.modelSettings?.avatar_photo_s3key as string | undefined;
      const imageAssetId = await this.uploadImageAsset(avatarPhotoS3Key, avatarPhotoUrl);
      body.image_asset_id = imageAssetId;
      logger.info({ imageAssetId }, "HeyGen: using uploaded image asset");
    } else {
      body.avatar_id = avatarId;
    }

    const res = await fetch(`${HEYGEN_API}/v2/videos`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HeyGen /v2/videos submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { data?: { video_id?: string } };
    const videoId = data.data?.video_id;
    if (!videoId) throw new Error(`HeyGen: no video_id in response: ${JSON.stringify(data)}`);
    return videoId;
  }

  async poll(videoId: string): Promise<VideoResult | null> {
    const res = await fetch(`${HEYGEN_API}/v2/videos/${videoId}`, {
      headers: this.jsonHeaders,
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HeyGen poll failed: ${res.status} ${text}`);
    } else {
      logger.info({ videoId }, `HeyGen polling response: ${text}`);
    }

    const result = (await res.json()) as HeyGenVideoStatus;
    const data = result.data;

    if (!data) throw new Error("HeyGen: empty status response");
    if (data.status === "failed")
      throw new Error(`HeyGen video failed: ${JSON.stringify(data.error ?? "unknown")}`);
    if (data.status !== "completed") return null;

    const url = data.video_url;
    if (!url) throw new Error("HeyGen: no video_url in completed status");
    return { url, filename: "heygen.mp4" };
  }
}
