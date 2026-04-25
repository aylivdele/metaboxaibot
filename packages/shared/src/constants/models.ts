import type { AIModel } from "../types/ai.js";
import { GPT_MODELS } from "./models/gpt.models.js";
import { DESIGN_MODELS } from "./models/design.models.js";
import { VIDEO_MODELS } from "./models/video.models.js";
import { AUDIO_MODELS } from "./models/audio.models.js";

export const AI_MODELS: Record<string, AIModel> = {
  ...GPT_MODELS,
  ...DESIGN_MODELS,
  ...VIDEO_MODELS,
  ...AUDIO_MODELS,
};

// Модели по секции
export const MODELS_BY_SECTION = Object.values(AI_MODELS).reduce(
  (acc, model) => {
    if (!acc[model.section]) acc[model.section] = [];
    acc[model.section].push(model);
    return acc;
  },
  {} as Record<string, AIModel[]>,
);
