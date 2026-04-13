import type {
  VideoAdapter,
  VideoInput,
  VideoResult,
  VideoValidationError,
} from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";
import { parseRunwayTaskFailure } from "../../utils/runway-error.js";

const RUNWAY_API = "https://api.dev.runwayml.com/v1";

interface RunwayTask {
  id: string;
  status: string;
  output?: string[];
  failure?: string;
  failureCode?: string | null;
}

/**
 * RunwayML Gen-3 Alpha adapter (REST API).
 */
export class RunwayAdapter implements VideoAdapter {
  readonly modelId = "runway";

  private readonly apiKey: string;

  constructor(apiKey = config.ai.runway ?? "") {
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    };
  }

  validateRequest(input: VideoInput): VideoValidationError | null {
    const imgUrl = input.mediaInputs?.first_frame?.[0] ?? input.imageUrl;
    if (!imgUrl) return { key: "runwayRequiresImage" };
    return null;
  }

  async submit(input: VideoInput): Promise<string> {
    const imageUrl = input.mediaInputs?.first_frame?.[0] ?? input.imageUrl;
    if (!imageUrl) throw new Error("Runway: imageUrl missing (validation bypassed)");

    // Runway rejects Telegram URLs (application/octet-stream) — download and encode as data URL
    const imgResp = await fetchWithLog(imageUrl);
    if (!imgResp.ok) throw new Error(`Runway: failed to fetch reference image: ${imgResp.status}`);
    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
    const mimeType = imgResp.headers.get("content-type") ?? "image/jpeg";
    const safeType = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
    const promptImage = `data:${safeType};base64,${imgBuffer.toString("base64")}`;

    const ms = input.modelSettings ?? {};
    const body: Record<string, unknown> = {
      promptText: input.prompt,
      model: "gen4.5",
      ratio: input.aspectRatio ?? "1280:720",
      duration: input.duration ?? 5,
      promptImage,
    };
    if (ms.seed != null) body.seed = ms.seed;
    if (
      ms.camera_horizontal !== undefined ||
      ms.camera_vertical !== undefined ||
      ms.camera_zoom !== undefined
    ) {
      body.motion = {
        ...(ms.camera_horizontal !== undefined
          ? { camera: { horizontal: ms.camera_horizontal } }
          : {}),
        ...(ms.camera_vertical !== undefined ? { camera: { vertical: ms.camera_vertical } } : {}),
        ...(ms.camera_zoom !== undefined ? { camera: { zoom: ms.camera_zoom } } : {}),
      };
    }

    const res = await fetchWithLog(`${RUNWAY_API}/image_to_video`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async poll(taskId: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${RUNWAY_API}/tasks/${taskId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway poll failed: ${res.status} ${text}`);
    }

    const task = (await res.json()) as RunwayTask;

    if (task.status === "FAILED") {
      throw parseRunwayTaskFailure(task.failureCode, task.failure);
    }
    if (task.status !== "SUCCEEDED") return null;

    const url = task.output?.[0];
    if (!url) throw new Error("Runway: no output URL in succeeded task");
    return { url, filename: "runway.mp4" };
  }
}
