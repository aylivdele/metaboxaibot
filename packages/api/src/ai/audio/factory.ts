import type { AudioAdapter } from "./base.adapter.js";
import { OpenAiTtsAdapter } from "./openai-tts.adapter.js";
import { ElevenLabsAdapter } from "./elevenlabs.adapter.js";
import { ApipassSunoAdapter } from "./apipass-suno.adapter.js";

export function createAudioAdapter(modelId: string): AudioAdapter {
  switch (modelId) {
    case "tts-openai":
      return new OpenAiTtsAdapter();
    case "voice-clone":
      return new ElevenLabsAdapter("voice-clone");
    case "sounds-el":
      return new ElevenLabsAdapter("sounds-el");
    case "suno":
      return new ApipassSunoAdapter();
    default:
      throw new Error(`Unknown audio model: ${modelId}`);
  }
}
