import { config } from "@metabox/shared";
import type { AvatarAdapter, AvatarCreateResult, AvatarPollResult } from "./base.adapter.js";
import { logger } from "../../logger.js";

const HEYGEN_API = "https://api.heygen.com";
const HEYGEN_UPLOAD = "https://upload.heygen.com";

export class HeyGenAvatarAdapter implements AvatarAdapter {
  readonly provider = "heygen";

  private readonly apiKey: string;

  constructor(apiKey = config.ai.heygen ?? "") {
    this.apiKey = apiKey;
  }

  async create(imageBuffer: Buffer, contentType: string): Promise<AvatarCreateResult> {
    // 1. Upload image asset (raw binary body)
    const uploadRes = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": contentType },
      body: imageBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`HeyGen asset upload failed: ${uploadRes.status} ${text}`);
    }
    const uploadData = (await uploadRes.json()) as { data?: { image_key?: string } };
    const imageKey = uploadData.data?.image_key;
    if (!imageKey) throw new Error("HeyGen: no image_key in asset upload response");

    // 2. Create avatar group from the uploaded image
    const createRes = await fetch(`${HEYGEN_API}/v2/photo_avatar/avatar_group/create`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `avatar_${Date.now()}`, image_key: imageKey }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`HeyGen avatar group create failed: ${createRes.status} ${text}`);
    }
    const createData = (await createRes.json()) as { data?: { id?: string } };
    const groupId = createData.data?.id;
    if (!groupId) throw new Error("HeyGen: no group id in avatar group create response");

    return { externalId: groupId };
  }

  async poll(externalId: string): Promise<AvatarPollResult> {
    const res = await fetch(`${HEYGEN_API}/v2/photo_avatar/avatar_group/${externalId}`, {
      headers: { "X-Api-Key": this.apiKey },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { externalId, status: res.status, body: text },
        "HeyGen avatar poll HTTP error, treating as processing",
      );
      return { status: "processing" };
    }
    const data = (await res.json()) as {
      data?: {
        status?: string;
        avatar_list?: Array<{ id: string; preview_url?: string; preview_image_url?: string }>;
      };
    };
    logger.info({ externalId }, `Poll result: ${JSON.stringify(data)}`);
    const status = data.data?.status;
    if (status === "completed") {
      const first = data.data?.avatar_list?.[0];
      return {
        status: "ready",
        previewUrl: first?.preview_image_url ?? first?.preview_url,
      };
    }
    if (status === "failed") return { status: "failed" };
    return { status: "processing" };
  }
}
