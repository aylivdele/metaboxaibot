import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { getFileUrl } from "../../services/s3.service.js";
import { logger } from "../../logger.js";
import { fetchWithLog } from "../../utils/fetch.js";
import { transcodeOggToMp3 } from "../../utils/audio-transcode.js";

const HEYGEN_API = "https://api.heygen.com";
const HEYGEN_UPLOAD = "https://upload.heygen.com";

interface HeyGenVideoDetail {
  data?: {
    status: string;
    video_url?: string | null;
    failure_message?: string | null;
    failure_code?: string | null;
  };
}

/** v3 only supports "16:9" and "9:16"; everything else falls back to "16:9". */
const SUPPORTED_ASPECT_RATIOS = new Set(["16:9", "9:16"]);

/**
 * HeyGen talking-avatar adapter using POST /v3/videos (flat body).
 *
 * Avatar source priority:
 *  1. modelSettings.image_asset_id    → pre-uploaded photo asset (image_asset_id)
 *  2. modelSettings.avatar_photo_url  → upload image now → image_asset_id
 *  3. modelSettings.avatar_id         → official avatar look_id (from /v3/avatars/looks)
 *  4. default avatarId from config    → avatar_id
 *
 * Voice source priority:
 *  1. modelSettings.voice_url / voice_s3key → audio_asset_id (lip-sync)
 *  2. modelSettings.voice_id + prompt        → script + voice_id (TTS)
 *
 * Asset uploads remain on v1. Video status polling uses GET /v3/videos/:id.
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

  /** Upload audio file to HeyGen asset storage (v1). Returns asset id. */
  private async uploadAudioAsset(audioUrl: string): Promise<string> {
    const audioRes = await fetchWithLog(audioUrl);
    if (!audioRes.ok)
      throw new Error(`Failed to fetch audio for HeyGen upload: ${audioRes.status}`);
    let audioBuffer = Buffer.from(await audioRes.arrayBuffer()) as Buffer;
    let contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";

    // HeyGen does not support OGG/Opus — transcode to MP3 first
    if (contentType.includes("ogg") || contentType.includes("opus")) {
      audioBuffer = await transcodeOggToMp3(audioBuffer);
      contentType = "audio/mpeg";
    }

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

  /** Upload raw image to HeyGen asset storage (v1). Returns asset id. */
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
    const uploadData = (await uploadRes.json()) as { data?: { id?: string } };
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
    const aspectRatioRaw = input.aspectRatio ?? "16:9";
    const aspectRatio = SUPPORTED_ASPECT_RATIOS.has(aspectRatioRaw) ? aspectRatioRaw : "16:9";
    const resolution = (input.modelSettings?.resolution as string | undefined) ?? "720p";

    // ── Audio asset (lip-sync) ───────────────────────────────────────────────
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

    // ── Build flat POST /v3/videos body ──────────────────────────────────────
    const body: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      resolution,
      background: { type: "color", value: bgColor },
    };

    // Avatar: pre-uploaded asset > one-shot upload > official look_id
    if (imageAssetIdFromSettings) {
      body.image_asset_id = imageAssetIdFromSettings;
      logger.info(
        { imageAssetId: imageAssetIdFromSettings },
        "HeyGen: using pre-uploaded image asset",
      );
    } else if (avatarPhotoUrl) {
      const avatarPhotoS3Key = input.modelSettings?.avatar_photo_s3key as string | undefined;
      const uploadedId = await this.uploadImageAsset(avatarPhotoS3Key, avatarPhotoUrl);
      body.image_asset_id = uploadedId;
      logger.info({ imageAssetId: uploadedId }, "HeyGen: using uploaded image asset");
    } else {
      body.avatar_id = avatarId;
    }

    // Photo-avatar-only fields
    if (body.image_asset_id) {
      const expressiveness = input.modelSettings?.expressiveness as string | undefined;
      const motionPrompt = input.modelSettings?.motion_prompt as string | undefined;
      if (expressiveness) body.expressiveness = expressiveness;
      if (motionPrompt) body.motion_prompt = motionPrompt;
    }

    // Voice: audio asset (lip-sync) or TTS
    if (audioAssetId) {
      body.audio_asset_id = audioAssetId;
    } else {
      body.script = input.prompt;
      body.voice_id = voiceId;
      // voice_settings applies only to TTS
      if (input.modelSettings?.voice_settings_enabled === true) {
        const speed = input.modelSettings?.voice_speed as number | undefined;
        const pitch = input.modelSettings?.voice_pitch as number | undefined;
        const locale = input.modelSettings?.voice_locale as string | undefined;
        const voiceSettings: Record<string, unknown> = {};
        if (speed !== undefined) voiceSettings.speed = speed;
        if (pitch !== undefined) voiceSettings.pitch = pitch;
        if (locale) voiceSettings.locale = locale;
        if (Object.keys(voiceSettings).length > 0) body.voice_settings = voiceSettings;
      }
    }

    const res = await fetchWithLog(`${HEYGEN_API}/v3/videos`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HeyGen /v3/videos submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { data?: { video_id?: string } };
    const videoId = data.data?.video_id;
    if (!videoId) throw new Error(`HeyGen: no video_id in response: ${JSON.stringify(data)}`);
    return videoId;
  }

  async poll(videoId: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${HEYGEN_API}/v3/videos/${videoId}`, {
      headers: this.jsonHeaders,
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HeyGen poll failed: ${res.status} ${text}`);
    }

    const result = JSON.parse(text) as HeyGenVideoDetail;
    const data = result.data;

    if (!data) throw new Error("HeyGen: empty status response");
    if (data.status === "failed") {
      throw new Error(
        `HeyGen video failed: ${data.failure_message ?? data.failure_code ?? "unknown"}`,
      );
    }
    if (data.status !== "completed") return null;

    const url = data.video_url;
    if (!url) throw new Error("HeyGen: no video_url in completed status");
    return { url, filename: "heygen.mp4" };
  }
}
