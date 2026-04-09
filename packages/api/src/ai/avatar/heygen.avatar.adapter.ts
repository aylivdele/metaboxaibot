import { config } from "@metabox/shared";
import type { AvatarAdapter, AvatarCreateResult, AvatarPollResult } from "./base.adapter.js";
import { fetchWithLog } from "../../utils/fetch.js";
import { resolveImageMimeType } from "../../utils/mime-detect.js";

const HEYGEN_UPLOAD = "https://upload.heygen.com";

export class HeyGenAvatarAdapter implements AvatarAdapter {
  readonly provider = "heygen";

  private readonly apiKey: string;

  constructor(apiKey = config.ai.heygen ?? "") {
    this.apiKey = apiKey;
  }

  /**
   * Upload image to HeyGen asset storage.
   * Returns externalId = HeyGen asset id, usable as `image_asset_id` in /v2/videos.
   * Creation is synchronous — no training job needed.
   */
  async create(imageBuffer: Buffer, contentType: string): Promise<AvatarCreateResult> {
    // HTTP Content-Type from S3 presigned URLs is often application/octet-stream.
    // Detect the real image type from magic bytes so HeyGen accepts the upload.
    const resolvedContentType = resolveImageMimeType(imageBuffer, contentType);
    const uploadRes = await fetchWithLog(`${HEYGEN_UPLOAD}/v1/asset`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": resolvedContentType },
      body: imageBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { id?: string } };
    const assetId = uploadData.data?.id;
    if (!assetId)
      throw new Error(`HeyGen: no asset id in upload response: ${JSON.stringify(uploadData)}`);

    return { externalId: assetId };
  }

  /** Stub — avatar is ready immediately after upload, no polling needed. */
  async poll(_externalId: string): Promise<AvatarPollResult> {
    return { status: "ready" };
  }
}
