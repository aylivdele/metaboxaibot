import type { AudioAdapter } from "./base.adapter.js";
import { OpenAiTtsAdapter } from "./openai-tts.adapter.js";
import { ElevenLabsAdapter } from "./elevenlabs.adapter.js";
import { ApipassSunoAdapter } from "./apipass-suno.adapter.js";
import { buildProxyFetch } from "../transport/proxy-fetch.js";
import type { AdapterContext } from "../with-pool.js";

export { ElevenLabsAdapter };

export function createAudioAdapter(modelId: string, ctx?: AdapterContext): AudioAdapter {
  const apiKey = ctx?.apiKey;
  const fetchFn = ctx ? (buildProxyFetch(ctx.proxy) ?? undefined) : undefined;

  switch (modelId) {
    case "tts-openai":
      return new OpenAiTtsAdapter(apiKey, fetchFn);
    case "voice-clone":
      return new ElevenLabsAdapter("voice-clone", apiKey, fetchFn);
    case "tts-el":
      return new ElevenLabsAdapter("tts-el", apiKey, fetchFn);
    case "sounds-el":
      return new ElevenLabsAdapter("sounds-el", apiKey, fetchFn);
    case "music-el":
      return new ElevenLabsAdapter("music-el", apiKey, fetchFn);
    case "suno":
      return new ApipassSunoAdapter(apiKey, fetchFn);
    default:
      throw new Error(`Unknown audio model: ${modelId}`);
  }
}
