import { AI_MODELS } from "@metabox/shared";
import type { ImageAdapter } from "./base.adapter.js";
export type { ImageResult } from "./base.adapter.js";
import { DalleAdapter } from "./dalle.adapter.js";
import { FalAdapter } from "./fal.adapter.js";
import { ReplicateAdapter } from "./replicate.adapter.js";
import { RecraftAdapter } from "./recraft.adapter.js";
import { GptImageAdapter } from "./gpt-image.adapter.js";
import { HiggsFieldSoulImageAdapter } from "./higgsfield.soul.adapter.js";
import { KieImageAdapter } from "./kie.adapter.js";

export function createImageAdapter(modelId: string): ImageAdapter {
  const model = AI_MODELS[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  switch (model.provider) {
    case "openai":
      if (modelId === "gpt-image-1.5") return new GptImageAdapter();
      return new DalleAdapter();
    case "fal":
      return new FalAdapter(modelId);
    case "recraft":
      return new RecraftAdapter(modelId);
    case "replicate":
    case "ideogram":
    case "midjourney":
      return new ReplicateAdapter(modelId);
    case "google":
      // Imagen 4 — use Replicate mirror until direct API is available
      return new ReplicateAdapter(modelId);
    case "higgsfield":
      return new HiggsFieldSoulImageAdapter();
    case "kie":
      return new KieImageAdapter();
    default:
      throw new Error(`No image adapter for provider: ${model.provider} (model: ${modelId})`);
  }
}
