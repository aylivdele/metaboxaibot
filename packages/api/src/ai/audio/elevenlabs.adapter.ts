import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/** Default voice ID — Rachel */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * ElevenLabs adapter.
 * - modelId "voice-clone": TTS using a specified ElevenLabs voice (synchronous).
 * - modelId "sounds-el": sound effects generation via /v1/sound-generation (synchronous).
 */
export class ElevenLabsAdapter implements AudioAdapter {
  readonly isAsync = false;

  constructor(
    readonly modelId: "voice-clone" | "sounds-el",
    private readonly apiKey = config.ai.elevenlabs ?? "",
  ) {}

  private headers() {
    return {
      "xi-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async generate(input: AudioInput): Promise<AudioResult> {
    if (this.modelId === "sounds-el") {
      return this.generateSound(input);
    }
    return this.generateSpeech(input);
  }

  private async generateSpeech(input: AudioInput): Promise<AudioResult> {
    const voiceId = input.voiceId ?? DEFAULT_VOICE_ID;
    const ms = input.modelSettings ?? {};
    const voiceSettings = {
      stability: (ms.stability as number | undefined) ?? 0.5,
      similarity_boost: (ms.similarity_boost as number | undefined) ?? 0.75,
      style: (ms.style as number | undefined) ?? 0.0,
      use_speaker_boost: (ms.use_speaker_boost as boolean | undefined) ?? true,
    };

    const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        text: input.prompt,
        model_id: "eleven_multilingual_v2",
        voice_settings: voiceSettings,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs TTS failed: ${res.status} ${text}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, ext: "mp3", contentType: "audio/mpeg" };
  }

  private async generateSound(input: AudioInput): Promise<AudioResult> {
    const res = await fetch(`${ELEVENLABS_API}/sound-generation`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        text: input.prompt,
        duration_seconds: 5,
        prompt_influence: 0.3,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs sound generation failed: ${res.status} ${text}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, ext: "mp3", contentType: "audio/mpeg" };
  }
}
