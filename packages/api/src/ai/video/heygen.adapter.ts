import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { getFileUrl } from "../../services/s3.service.js";
import { logger } from "../../logger.js";
import { fetchWithLog } from "../../utils/fetch.js";

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

  /** Upload audio file to HeyGen asset storage. Returns asset id. */
  private async uploadAudioAsset(audioUrl: string): Promise<string> {
    const audioRes = await fetchWithLog(audioUrl);
    if (!audioRes.ok)
      throw new Error(`Failed to fetch audio for HeyGen upload: ${audioRes.status}`);
    const audioBuffer = await audioRes.arrayBuffer();
    const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";

    const uploadRes = await fetchWithLog(`${HEYGEN_UPLOAD}/v1/asset`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": contentType },
      body: audioBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen audio asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { id?: string } };
    const assetId = uploadData.data?.id;
    if (!assetId)
      throw new Error(
        `HeyGen: no asset id in audio upload response: ${JSON.stringify(uploadData)}`,
      );
    return assetId;
  }

  /** Upload raw image to HeyGen asset storage. Returns image_key (used as image_asset_id). */
  private async uploadImageAsset(s3Key: string | undefined, fallbackUrl: string): Promise<string> {
    const imageUrl = s3Key
      ? ((await getFileUrl(s3Key).catch(() => null)) ?? fallbackUrl)
      : fallbackUrl;

    const imgRes = await fetchWithLog(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image for HeyGen upload: ${imgRes.status}`);
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

    const uploadRes = await fetchWithLog(`${HEYGEN_UPLOAD}/v1/asset`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": contentType },
      body: imgBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { id?: string; image_key?: string } };
    const assetId = uploadData.data?.id;
    if (!assetId)
      throw new Error(`HeyGen: no asset id in upload response: ${JSON.stringify(uploadData)}`);
    return assetId;
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
    const resolution = (input.modelSettings?.resolution as string | undefined) ?? "1080p";

    // ── Audio ────────────────────────────────────────────────────────────────
    let audioAssetId: string | undefined;
    if (voiceUrl) {
      audioAssetId = await this.uploadAudioAsset(voiceUrl);
      logger.info({ audioAssetId }, "HeyGen: uploaded audio asset");
    }

    // ── Avatar source ────────────────────────────────────────────────────────
    const imageAssetIdFromSettings = input.modelSettings?.image_asset_id as string | undefined;
    const avatarPhotoUrl = await HeyGenAdapter.freshUrl(
      input.modelSettings?.avatar_photo_s3key,
      input.modelSettings?.avatar_photo_url,
    );
    const avatarId = (input.modelSettings?.avatar_id as string | undefined) || this.defaultAvatarId;

    // ── Build flat /v2/videos body ───────────────────────────────────────────
    const body: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      resolution,
      background: { type: "color", value: bgColor },
      ...(audioAssetId
        ? { audio_asset_id: audioAssetId }
        : { script: input.prompt, voice_id: voiceId }),
    };

    // Avatar priority: pre-uploaded asset → one-shot photo upload → official avatar
    let usesImageAsset = false;
    if (imageAssetIdFromSettings) {
      body.image_asset_id = imageAssetIdFromSettings;
      usesImageAsset = true;
      logger.info(
        { imageAssetId: imageAssetIdFromSettings },
        "HeyGen: using pre-uploaded image asset",
      );
    } else if (avatarPhotoUrl) {
      const avatarPhotoS3Key = input.modelSettings?.avatar_photo_s3key as string | undefined;
      const uploadedId = await this.uploadImageAsset(avatarPhotoS3Key, avatarPhotoUrl);
      body.image_asset_id = uploadedId;
      usesImageAsset = true;
      logger.info({ imageAssetId: uploadedId }, "HeyGen: using uploaded image asset");
    } else {
      body.avatar_id = avatarId;
    }

    // Photo-avatar-only fields
    if (usesImageAsset) {
      const expressiveness = input.modelSettings?.expressiveness as string | undefined;
      const motionPrompt = input.modelSettings?.motion_prompt as string | undefined;
      if (expressiveness) body.expressiveness = expressiveness;
      if (motionPrompt) body.motion_prompt = motionPrompt;
    }

    // Voice settings (only when enabled)
    if (input.modelSettings?.voice_settings_enabled === true) {
      const speed = input.modelSettings?.voice_speed as number | undefined;
      const pitch = input.modelSettings?.voice_pitch as number | undefined;
      const locale = input.modelSettings?.voice_locale as string | undefined;
      if (speed !== undefined) body.speed = speed;
      if (pitch !== undefined) body.pitch = pitch;
      if (locale) body.locale = locale;
    }

    const res = await fetchWithLog(`${HEYGEN_API}/v2/videos`, {
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
    const res = await fetchWithLog(`${HEYGEN_API}/v2/videos/${videoId}`, {
      headers: this.jsonHeaders,
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HeyGen poll failed: ${res.status} ${text}`);
    }

    const result = JSON.parse(text) as HeyGenVideoStatus;
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

//{"data":{"completed_at":1774616501,"created_at":1774616460,"duration":1.69796,"gif_url":"https://resource2.heygen.ai/video/398e496ce80049118a38da09d481c1db/gif.gif","id":"398e496ce80049118a38da09d481c1db","status":"completed","thumbnail_url":"https://files2.heygen.ai/aws_pacific/avatar_tmp/a2e501ec43184c02813519fb555d46ab/398e496ce80049118a38da09d481c1db.jpeg?Expires=1775221770&Signature=T9v8mrJrHcd3iI5OFv-qu6g1JnSQNLEAf3~MD6G1OiB9x4Q3MNGL9XjiQHZ8IogAVNnnaFbj8oHnPCpkOLMczXLIW5ibJtyBpbFfaSvroBj6xKN1k9pb8aDVX4oOa8-UtB9~ed1O4hkb8PhoSkdr3Tm8ObG6l1Vx6UKR5Iu-426pCZy62-9l21F7KO-~Bq4ixVqQckNcZnYUGxU64Ji9URGOAVfofHhqFapusd7e2DRRjkTiIswM13Rt8qWcgV33T4EMfVvUqtpDKLbeHanK8a2bkV9KmFO1xt5UxS~ZIQFQmHV4JA~gdnZIzPGurqCAC1u-yijEa~KOhkigeHLGZw__&Key-Pair-Id=K38HBHX5LX3X2H","title":"398e496ce80049118a38da09d481c1db","video_page_url":"https://app.heygen.com/videos/398e496ce80049118a38da09d481c1db","video_url":"https://files2.heygen.ai/aws_pacific/avatar_tmp/a2e501ec43184c02813519fb555d46ab/398e496ce80049118a38da09d481c1db.mp4?Expires=1775221317&Signature=P~3LVRRn4rOERciuizscb-Fuayi3ANAXnAk7PwYXQuxRzYIYLi7PSxbj-puwh0r3uT50xRn8MdbkWoI3GJC9PRQQGKhq5hb3LLytzJ4liNWMnvC53VRDrGREF6fRAdspeb6vcu-s8gvHkSfUtN2NOpwsvB5-7oM~qGQqEMQYmn0uj-7JxiG5xtmF-6XAcPl0PJPgjop6NW-j7nBXDu7ne-yU8W2iWYD7k4jKc377nkgz~BqIPy4pjtu0z7m5RQx8xMqCO7kYICZX7ppSB8tRUQk9lI7izLyH-l~RJnQCLftIXnPHtHw4D5TAp2prubwpJvTknu4g1ViXwZia7yfJMA__&Key-Pair-Id=K38HBHX5LX3X2H"}}
