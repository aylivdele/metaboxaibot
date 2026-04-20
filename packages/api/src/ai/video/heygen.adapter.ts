import type {
  VideoAdapter,
  VideoInput,
  VideoResult,
  VideoValidationContext,
  VideoValidationError,
} from "./base.adapter.js";
import { config } from "@metabox/shared";
import { getFileUrl } from "../../services/s3.service.js";
import { logger } from "../../logger.js";
import { fetchWithLog } from "../../utils/fetch.js";
import { transcodeToMp3 } from "../../utils/audio-transcode.js";
import { parseHeyGenErrorBody, parseHeyGenPollFailure } from "../../utils/heygen-error.js";
import { resolveImageMimeType, resolveAudioMimeType } from "../../utils/mime-detect.js";

const HEYGEN_API = "https://api.heygen.com";

interface HeyGenVideoDetail {
  data?: {
    id: string;
    status: string;
    video_url?: string | null;
    failure_message?: string | null;
    failure_code?: string | null;
  };
}

/** v3 only supports "16:9" and "9:16"; everything else falls back to "16:9". */
const SUPPORTED_ASPECT_RATIOS = new Set(["16:9", "9:16"]);

/**
 * HeyGen talking-avatar adapter using v3 API.
 *
 * Endpoints:
 *  - POST /v3/videos   — create video (discriminated union: type "avatar" | "image")
 *  - GET  /v3/videos/:id — poll status
 *  - POST /v3/assets    — upload image/audio assets
 *
 * Avatar source priority:
 *  1. modelSettings.image_asset_id    → pre-uploaded photo asset → type "image"
 *  2. modelSettings.avatar_photo_url  → upload image now → type "image"
 *  3. modelSettings.avatar_id         → official avatar look_id → type "avatar"
 *  4. default avatarId from config    → type "avatar"
 *
 * Voice source priority:
 *  1. modelSettings.voice_url / voice_s3key → audio_asset_id (lip-sync)
 *  2. modelSettings.voice_id + prompt        → script + voice_id (TTS)
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
    if (!audioBuffer.byteLength) {
      logger.error(
        { audioUrl, status: audioRes.status, headers: Object.fromEntries(audioRes.headers) },
        "HeyGen: fetched audio body is empty",
      );
      throw new Error("HeyGen: fetched audio body is empty");
    }
    // Detect actual audio type from magic bytes — HTTP Content-Type may be unreliable.
    let contentType = resolveAudioMimeType(audioBuffer, audioRes.headers.get("content-type"));

    // HeyGen accepts only MP3 and WAV. Transcode anything else (OGG, M4A, AAC, FLAC, ...).
    const isHeyGenSupported =
      contentType === "audio/mpeg" || contentType === "audio/mp3" || contentType === "audio/wav";
    if (!isHeyGenSupported) {
      logger.info({ from: contentType }, "HeyGen: transcoding audio to MP3");
      audioBuffer = await transcodeToMp3(audioBuffer);
      contentType = "audio/mpeg";
      if (!audioBuffer.byteLength) {
        throw new Error("HeyGen: audio buffer empty after transcode to MP3");
      }
    }

    const audioExt = contentType === "audio/wav" ? "wav" : "mp3";
    const audioForm = new FormData();
    audioForm.append(
      "file",
      new Blob(
        [new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength)],
        { type: contentType },
      ),
      `audio.${audioExt}`,
    );

    const uploadRes = await fetchWithLog(`${HEYGEN_API}/v3/assets`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey },
      body: audioForm,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen audio asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { asset_id?: string } };
    const assetId = uploadData.data?.asset_id;
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

    // Detect actual image type from magic bytes — HTTP Content-Type may be unreliable
    // (S3 presigned URLs and Telegram file URLs often return application/octet-stream).
    const contentType = resolveImageMimeType(imgBuffer, imgRes.headers.get("content-type"));

    const imgExt = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    if (!imgBuffer.byteLength) {
      throw new Error("HeyGen: image buffer is empty after fetch");
    }

    const imgFormData = new FormData();
    imgFormData.append(
      "file",
      new Blob([new Uint8Array(imgBuffer)], { type: contentType }),
      `image.${imgExt}`,
    );

    const uploadRes = await fetchWithLog(`${HEYGEN_API}/v3/assets`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey },
      body: imgFormData,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { asset_id?: string } };
    const assetId = uploadData.data?.asset_id;
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

  validateRequest(input: VideoInput, ctx?: VideoValidationContext): VideoValidationError | null {
    const ms = input.modelSettings ?? {};
    const hasAvatar =
      !!input.imageUrl ||
      !!(ms.image_asset_id as string | undefined)?.trim() ||
      !!(ms.avatar_id as string | undefined)?.trim() ||
      !!(ms.avatar_photo_s3key as string | undefined)?.trim() ||
      !!(ms.avatar_photo_url as string | undefined)?.trim();
    if (!hasAvatar) return { key: "heygenNeedsAvatar" };

    const explicitVoiceId = (ms.voice_id as string | undefined)?.trim();
    const hasVoiceAsset =
      !!(ms.voice_s3key as string | undefined)?.trim() ||
      !!(ms.voice_url as string | undefined)?.trim();
    if (!explicitVoiceId && !hasVoiceAsset && !ctx?.hasVoiceFile) {
      return { key: "heygenNeedsVoice" };
    }
    return null;
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

    // ── Build POST /v3/videos body (discriminated union) ────────────────────
    const body: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      resolution,
      background: { type: "color", value: bgColor },
    };

    // Avatar source → determines type: "avatar" vs type: "image"
    if (input.imageUrl) {
      const uploadedId = await this.uploadImageAsset(undefined, input.imageUrl);
      body.type = "image";
      body.image = { type: "asset_id", asset_id: uploadedId };
      logger.info({ imageAssetId: uploadedId }, "HeyGen: using uploaded image asset");
    } else if (avatarPhotoUrl) {
      const avatarPhotoS3Key = input.modelSettings?.avatar_photo_s3key as string | undefined;
      const uploadedId = await this.uploadImageAsset(avatarPhotoS3Key, avatarPhotoUrl);
      body.type = "image";
      body.image = { type: "asset_id", asset_id: uploadedId };
      logger.info({ imageAssetId: uploadedId }, "HeyGen: using uploaded image asset");
    } else if (imageAssetIdFromSettings) {
      body.type = "image";
      body.image = { type: "asset_id", asset_id: imageAssetIdFromSettings };
      logger.info(
        { imageAssetId: imageAssetIdFromSettings },
        "HeyGen: using pre-uploaded image asset",
      );
    } else {
      body.type = "avatar";
      body.avatar_id = avatarId;
    }

    // Photo-avatar / image fields
    if (body.type === "image" || body.type === "avatar") {
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
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const structured = parseHeyGenErrorBody(json);
      if (structured) throw structured;
      throw new Error(`HeyGen /v3/videos submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { data?: { video_id?: string } };
    const videoId = data.data?.video_id;
    if (!videoId) throw new Error(`HeyGen: no video_id in response: ${JSON.stringify(data)}`);
    return videoId;
  }

  async poll(videoId: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${HEYGEN_API}/v3/videos/${videoId}`, {
      headers: { "X-Api-Key": this.apiKey },
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HeyGen poll failed: ${res.status} ${text}`);
    }

    const result = JSON.parse(text) as HeyGenVideoDetail;
    const data = result.data;

    logger.info({ videoId, result }, `Response from heygen`);

    if (!data) throw new Error("HeyGen: empty status response");
    if (data.status === "failed") {
      throw parseHeyGenPollFailure(data.failure_code, data.failure_message);
    }
    if (data.status !== "completed") return null;

    const url = data.video_url;
    if (!url) throw new Error("HeyGen: no video_url in completed status");
    return { url, filename: "heygen.mp4" };
  }
}
