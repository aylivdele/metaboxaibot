import {
  GoogleGenAI,
  type GenerateVideosOperation,
  type GenerateVideosParameters,
} from "@google/genai";
import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog, logCall } from "../../utils/fetch.js";
import { resolveImageMimeType } from "../../utils/mime-detect.js";

const API_MODELS: Record<string, string> = {
  veo: "veo-3.0-generate-001",
  "veo-fast": "veo-3.0-fast-generate-001",
};

/**
 * Google Veo 3 adapter — @google/genai SDK (generateVideos + getVideosOperation).
 *
 * referenceImages and video are passed via input.imageUrl (user sends a photo/video in chat).
 * aspectRatio, durationSeconds, personGeneration, resolution are configured in the mini-app.
 */
export class VeoAdapter implements VideoAdapter {
  readonly modelId: string;
  private readonly ai: GoogleGenAI;
  private readonly apiKey: string;
  private readonly apiModel: string;

  constructor(modelId = "veo", apiKey = config.ai.google ?? "") {
    this.modelId = modelId;
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
    this.apiModel = API_MODELS[modelId] ?? API_MODELS["veo"];
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};

    const params: GenerateVideosParameters = {
      model: this.apiModel,
      prompt: input.prompt,
      config: {
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
        ...(input.duration ? { durationSeconds: input.duration } : {}),
        ...(ms.person_generation ? { personGeneration: String(ms.person_generation) } : {}),
        ...(ms.resolution ? { resolution: String(ms.resolution) } : {}),
        ...(ms.negative_prompt ? { negativePrompt: String(ms.negative_prompt) } : {}),
      },
    };

    if (input.imageUrl) {
      const isVideo = /\.(mp4|webm|mov|avi)(\?|$)/i.test(input.imageUrl);
      if (isVideo) {
        params.video = { uri: input.imageUrl };
      } else {
        const imgResp = await fetchWithLog(input.imageUrl);
        if (!imgResp.ok) throw new Error(`Veo: failed to fetch reference image: ${imgResp.status}`);
        const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
        const mimeType = resolveImageMimeType(imgBuffer, imgResp.headers.get("content-type"));
        params.image = {
          imageBytes: imgBuffer.toString("base64"),
          mimeType,
        };
      }
    }

    logCall(this.apiModel, "generateVideos", {
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      personGeneration: ms.person_generation,
      resolution: ms.resolution,
      negativePrompt: ms.negative_prompt,
      hasImage: !!input.imageUrl,
    });

    const operation = await this.ai.models.generateVideos(params);
    if (!operation.name) throw new Error("Veo: no operation name in response");
    return operation.name;
  }

  async fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { "x-goog-api-key": this.apiKey } });
    if (!res.ok) throw new Error(`Veo: failed to download video: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async poll(operationName: string): Promise<VideoResult | null> {
    logCall(this.apiModel, "getVideosOperation", { operationName });

    const operation = await this.ai.operations.getVideosOperation({
      operation: { name: operationName } as GenerateVideosOperation,
    });

    if (operation.error) throw new Error(`Veo operation error: ${JSON.stringify(operation.error)}`);
    if (!operation.done) return null;

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error("Veo: no video URI in completed operation");
    return { url: uri, filename: "veo.mp4" };
  }
}
