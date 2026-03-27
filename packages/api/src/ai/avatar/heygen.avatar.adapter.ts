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
    const pollRes = await fetch(`${HEYGEN_API}/v2/avatar_group/${externalId}/avatars`, {
      headers: { "X-Api-Key": this.apiKey },
    });
    if (!pollRes.ok) {
      const text = await pollRes.text();
      logger.error({ externalId }, `HeyGen: list avatars in group error: ${text}`);
      throw new Error("HeyGen: avatar group processing failed");
    }
    const pollData = (await pollRes.json()) as {
      error?: string;
      data?: { avatar_list: Array<{ id: string; status: string }> };
    };
    logger.info(
      { groupId: externalId },
      `[HeyGen Adapter] Response from heygen group creation poll ${pollData}`,
    );
    if (pollData.error) {
      throw new Error(`HeyGen avatar group poll error: ${pollData.error}`);
    }
    const avatar = pollData.data?.avatar_list?.reduce(
      (pv, cv) => {
        if (!pv) {
          return cv;
        }
        if (pv.id === externalId) {
          return pv;
        }
        if (cv.id.startsWith(externalId)) {
          return cv;
        }
        return pv;
      },
      undefined as { id: string; status: string } | undefined,
    );

    if (avatar?.status === "completed") {
      return { status: "ready", talkingPhotoId: avatar.id };
    }
    if (avatar?.status === "failed") throw new Error("HeyGen: avatar group processing failed");

    return { status: "processing" };
  }

  async poll_training(externalId: string): Promise<AvatarPollResult> {
    // Step 1: check training status
    const res = await fetch(`${HEYGEN_API}/v2/photo_avatar/train/status/${externalId}`, {
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
      data?: { status?: string; error_msg?: string | null };
    };
    logger.info({ externalId, data }, "HeyGen avatar poll result");

    const status = data.data?.status;
    if (status === "ready") {
      // Step 2: find talking_photo_id and preview from the avatars list
      const talkingPhotoId = await this.findTalkingPhotoId(externalId);
      return { status: "ready", talkingPhotoId };
    }
    if (data.data?.error_msg) return { status: "failed" };
    return { status: "processing" };
  }

  private async findTalkingPhotoId(groupId: string): Promise<string | undefined> {
    const res = await fetch(`${HEYGEN_API}/v2/avatars`, {
      headers: { "X-Api-Key": this.apiKey },
    });
    if (!res.ok) {
      const resText = await res.text();
      throw new Error(`HeyGen avatars list error: ${res.status} ${resText}`);
    }
    const data = (await res.json()) as {
      data?: {
        talking_photos?: Array<{
          talking_photo_id: string;
          talking_photo_name?: string;
          preview_image_url?: string;
        }>;
      };
    };
    const photos = data.data?.talking_photos ?? [];
    // Match by group_id prefix or name containing group_id
    const match = photos.find(
      (p) =>
        p.talking_photo_id.startsWith(groupId) ||
        p.talking_photo_id === groupId ||
        p.talking_photo_name?.includes(groupId),
    );
    logger.info({ groupId, match, totalPhotos: photos.length }, "HeyGen talking photo lookup");
    return match?.talking_photo_id;
  }
}
