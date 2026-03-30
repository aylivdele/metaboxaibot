import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const RECRAFT_API_BASE = "https://external.api.recraft.ai/v1";

/** Maps our internal model IDs to Recraft API model IDs. */
const MODEL_MAP: Record<string, string> = {
  "recraft-v3": "recraftv3",
  "recraft-v4": "recraftv4",
  "recraft-v4-pro": "recraftv4_pro",
  "recraft-v4-vector": "recraftv4_vector",
  "recraft-v4-pro-vector": "recraftv4_pro_vector",
};

/** Maps aspect ratios to Recraft-supported pixel dimensions. */
const SIZE_MAP: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1365x1024",
  "3:4": "1024x1365",
  "16:9": "1820x1024",
  "9:16": "1024x1820",
  "5:4": "1280x1024",
  "4:5": "1024x1280",
};

/** Models that produce vector output. */
const VECTOR_MODELS = new Set(["recraft-v4-vector", "recraft-v4-pro-vector"]);

/**
 * Recraft native API adapter — synchronous generation.
 * Docs: https://www.recraft.ai/docs
 */
export class RecraftAdapter implements ImageAdapter {
  readonly isAsync = false;

  constructor(readonly modelId: string) {}

  async generate(input: ImageInput): Promise<ImageResult> {
    const apiKey = config.ai.recraft;
    if (!apiKey) throw new Error("RECRAFT_API_KEY not configured");

    const ms = input.modelSettings ?? {};
    const recraftModel = MODEL_MAP[this.modelId] ?? "recraftv4";
    const isVector = VECTOR_MODELS.has(this.modelId);
    const isV3 = this.modelId === "recraft-v3";
    const isV4 = this.modelId.startsWith("recraft-v4");
    const defaultStyle = isVector ? "vector_illustration" : "realistic_image";
    const style = (ms.style as string | undefined) ?? defaultStyle;

    // Build optional controls block (V3 supports artistic_level; all support no_text)
    const controls: Record<string, unknown> = {};
    if (ms.no_text) controls.no_text = true;
    if (isV3 && ms.artistic_level != null) controls.artistic_level = Number(ms.artistic_level);

    let url: string;

    if (input.imageUrl) {
      // Image-to-image via multipart form
      const imgResp = await fetchWithLog(input.imageUrl);
      if (!imgResp.ok) throw new Error(`Failed to fetch source image: ${imgResp.status}`);
      const blob = await imgResp.blob();

      const strength = ms.strength != null ? Number(ms.strength) : 0.5;

      const form = new FormData();
      form.append("image", blob, "input.png");
      form.append("prompt", input.prompt);
      form.append("model", recraftModel);
      if (!isV4) form.append("style", style);
      form.append("strength", String(strength));
      if (isV3 && ms.substyle) form.append("substyle", ms.substyle as string);
      if (ms.seed != null) form.append("random_seed", String(ms.seed));
      if (Object.keys(controls).length) form.append("controls", JSON.stringify(controls));

      const resp = await fetchWithLog(`${RECRAFT_API_BASE}/images/imageToImage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Recraft API error ${resp.status}: ${txt}`);
      }
      const data = (await resp.json()) as { data: Array<{ url: string }> };
      url = data.data[0]?.url;
    } else {
      // Text-to-image
      const size = SIZE_MAP[input.aspectRatio ?? "1:1"] ?? "1024x1024";
      const body: Record<string, unknown> = {
        prompt: input.prompt,
        model: recraftModel,
        size,
        ...(!isV4 ? { style } : {}),
      };
      if (isV3 && ms.substyle) body.substyle = ms.substyle;
      if (ms.seed != null) body.random_seed = ms.seed;
      if (Object.keys(controls).length) body.controls = controls;

      const resp = await fetchWithLog(`${RECRAFT_API_BASE}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Recraft API error ${resp.status}: ${txt}`);
      }
      const data = (await resp.json()) as { data: Array<{ url: string }> };
      url = data.data[0]?.url;
    }

    if (!url) throw new Error("Recraft: no image URL in response");
    const ext = isVector ? "svg" : "png";
    return { url, filename: `${this.modelId}.${ext}` };
  }
}
