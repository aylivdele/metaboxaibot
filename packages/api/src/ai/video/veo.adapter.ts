import { GoogleGenAI, GenerateVideosOperation, type GenerateVideosParameters } from "@google/genai";
import type {
  VideoAdapter,
  VideoInput,
  VideoResult,
  VideoValidationError,
} from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog, logCall } from "../../utils/fetch.js";
import { resolveImageMimeType } from "../../utils/mime-detect.js";

const API_MODELS: Record<string, string> = {
  veo: "veo-3.1-generate-preview",
  "veo-fast": "veo-3.1-fast-generate-preview",
};

async function fetchImagePayload(url: string): Promise<{ imageBytes: string; mimeType: string }> {
  const imgResp = await fetchWithLog(url);
  if (!imgResp.ok) throw new Error(`Veo: failed to fetch image: ${imgResp.status}`);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const mimeType = resolveImageMimeType(buf, imgResp.headers.get("content-type"));
  return { imageBytes: buf.toString("base64"), mimeType };
}

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

  validateRequest(input: VideoInput): VideoValidationError | null {
    const firstFrame = input.mediaInputs?.first_frame?.[0] ?? input.imageUrl;
    const lastFrame = input.mediaInputs?.last_frame?.[0];
    const refs = input.mediaInputs?.reference ?? [];
    if (
      (firstFrame || lastFrame || refs.length > 0) &&
      input.duration !== undefined &&
      input.duration !== 8
    ) {
      return { key: "veoImageRequires8s" };
    }
    return null;
  }

  async submit(input: VideoInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const firstFrameUrl = input.mediaInputs?.first_frame?.[0] ?? input.imageUrl;
    const lastFrameUrl = input.mediaInputs?.last_frame?.[0];
    const referenceUrls = (input.mediaInputs?.reference ?? []).slice(0, 3);

    const isVideoUrl = (u: string) => /\.(mp4|webm|mov|avi)(\?|$)/i.test(u);

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

    if (firstFrameUrl) {
      if (isVideoUrl(firstFrameUrl)) {
        params.video = { uri: firstFrameUrl };
      } else {
        params.image = await fetchImagePayload(firstFrameUrl);
      }
    }

    if (referenceUrls.length > 0) {
      const referenceImages = await Promise.all(
        referenceUrls.filter((u) => !isVideoUrl(u)).map(fetchImagePayload),
      );
      if (referenceImages.length > 0) {
        (params.config as Record<string, unknown>).referenceImages = referenceImages;
      }
    } else if (lastFrameUrl && !isVideoUrl(lastFrameUrl)) {
      // lastFrame is ignored by Veo when referenceImages are present.
      (params.config as Record<string, unknown>).lastFrame = await fetchImagePayload(lastFrameUrl);
    }

    logCall(this.apiModel, "generateVideos", {
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      personGeneration: ms.person_generation,
      resolution: ms.resolution,
      negativePrompt: ms.negative_prompt,
      hasFirstFrame: !!firstFrameUrl,
      hasLastFrame: !!lastFrameUrl,
      refCount: referenceUrls.length,
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

    const ref = new GenerateVideosOperation();
    ref.name = operationName;
    const operation = await this.ai.operations.getVideosOperation({
      operation: ref,
    });

    if (operation.error) throw new Error(`Veo operation error: ${JSON.stringify(operation.error)}`);
    if (!operation.done) return null;

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error("Veo: no video URI in completed operation");
    return { url: uri, filename: "veo.mp4" };
  }
}
