import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/** Default voice ID — Rachel */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * ElevenLabs adapter.
 * - modelId "tts-el": TTS using a specified ElevenLabs voice (synchronous).
 * - modelId "voice-clone": legacy alias — treated same as tts-el for backward compat.
 * - modelId "sounds-el": sound effects generation via /v1/sound-generation (synchronous).
 * - modelId "music-el": music/ambient generation via /v1/sound-generation (synchronous).
 */
export class ElevenLabsAdapter implements AudioAdapter {
  readonly isAsync = false;

  constructor(
    readonly modelId: "voice-clone" | "tts-el" | "sounds-el" | "music-el",
    private readonly apiKey = config.ai.elevenlabs ?? "",
  ) {}

  private headers() {
    return {
      "xi-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async generate(input: AudioInput): Promise<AudioResult> {
    if (this.modelId === "sounds-el" || this.modelId === "music-el") {
      return this.generateSound(input);
    }
    return this.generateSpeech(input);
  }

  private async generateSpeech(input: AudioInput): Promise<AudioResult> {
    const ms = input.modelSettings ?? {};
    // voice_id can come from modelSettings (webapp picker) or the legacy voiceId param
    const voiceId = (ms.voice_id as string | undefined) || input.voiceId || DEFAULT_VOICE_ID;
    const voiceSettings = {
      stability: (ms.stability as number | undefined) ?? 0.5,
      similarity_boost: (ms.similarity_boost as number | undefined) ?? 0.75,
      style: (ms.style as number | undefined) ?? 0.0,
      use_speaker_boost: (ms.use_speaker_boost as boolean | undefined) ?? true,
    };

    const modelId = (ms.model_id as string | undefined) ?? "eleven_multilingual_v2";

    const res = await fetchWithLog(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        text: input.prompt,
        model_id: modelId,
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
    const ms = input.modelSettings ?? {};
    const durationSeconds =
      typeof ms.duration_seconds === "number" ? ms.duration_seconds : undefined;
    const promptInfluence = typeof ms.prompt_influence === "number" ? ms.prompt_influence : 0.3;

    const body: Record<string, unknown> = {
      text: input.prompt,
      prompt_influence: promptInfluence,
    };
    if (durationSeconds !== undefined) body.duration_seconds = durationSeconds;

    const res = await fetchWithLog(`${ELEVENLABS_API}/sound-generation`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs sound generation failed: ${res.status} ${text}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, ext: "mp3", contentType: "audio/mpeg" };
  }

  /**
   * Clone a voice from an audio buffer.
   * Calls POST /v1/voices/add (multipart) and returns the new voice_id.
   * Static so it can be called from the bot scene without instantiating an adapter.
   */
  static async cloneVoice(
    audioBuffer: Buffer,
    filename: string,
    name: string,
    apiKey: string,
    removeBackgroundNoise = false,
  ): Promise<string> {
    const form = new FormData();
    form.append("name", name);
    form.append("files", new Blob([audioBuffer]), filename);
    form.append("remove_background_noise", String(removeBackgroundNoise));

    const res = await fetch(`${ELEVENLABS_API}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs voice clone failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { voice_id: string };
    return data.voice_id;
  }
}
