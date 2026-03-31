import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const API_MODELS: Record<string, string> = {
  veo: "veo-3.0-generate-001",
  "veo-fast": "veo-3.0-fast-generate-001",
};

interface VeoOperation {
  name: string;
  done?: boolean;
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; encoding?: string };
      }>;
    };
  };
  error?: { code: number; message: string };
}

/**
 * Google Veo 3 adapter — Gemini API (predictLongRunning + operation polling).
 *
 * referenceImages and video are passed via input.imageUrl (user sends a photo/video in chat).
 * aspectRatio, durationSeconds, personGeneration, resolution are configured in the mini-app.
 */
export class VeoAdapter implements VideoAdapter {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly apiModel: string;

  constructor(modelId = "veo", apiKey = config.ai.google ?? "") {
    this.modelId = modelId;
    this.apiKey = apiKey;
    this.apiModel = API_MODELS[modelId] ?? API_MODELS["veo"];
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.apiKey,
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};

    const instance: Record<string, unknown> = { prompt: input.prompt };

    // Reference image or video passed by the user alongside the prompt
    if (input.imageUrl) {
      // Detect video by extension; everything else is treated as a reference image
      const isVideo = /\.(mp4|webm|mov|avi)(\?|$)/i.test(input.imageUrl);
      if (isVideo) {
        instance.video = { fileUri: input.imageUrl };
      } else {
        instance.referenceImages = [
          { referenceType: "REFERENCE_TYPE_STYLE", referenceImage: { fileUri: input.imageUrl } },
        ];
      }
    }

    const parameters: Record<string, unknown> = {};
    if (input.aspectRatio) parameters.aspectRatio = input.aspectRatio;
    if (input.duration) parameters.durationSeconds = input.duration;
    if (ms.person_generation) parameters.personGeneration = ms.person_generation;
    if (ms.resolution) parameters.resolution = ms.resolution;
    if (ms.negative_prompt) parameters.negativePrompt = ms.negative_prompt;

    const res = await fetchWithLog(
      `${BASE}/models/${this.apiModel}:predictLongRunning?key=${this.apiKey}`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ instances: [instance], parameters }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Veo submit failed: ${res.status} ${text}`);
    }

    const op = (await res.json()) as VeoOperation;
    if (!op.name) throw new Error("Veo: no operation name in response");
    return op.name;
  }

  async poll(operationName: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${BASE}/${operationName}?key=${this.apiKey}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Veo poll failed: ${res.status} ${text}`);
    }

    const op = (await res.json()) as VeoOperation;

    if (op.error) throw new Error(`Veo operation error: ${op.error.message}`);
    if (!op.done) return null;

    const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
    const uri = sample?.video?.uri;
    if (!uri) throw new Error("Veo: no video URI in completed operation");
    return { url: uri, filename: "veo.mp4" };
  }
}
