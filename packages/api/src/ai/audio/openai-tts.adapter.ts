import OpenAI from "openai";
import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";

const DEFAULT_VOICE: OpenAI.Audio.Speech.SpeechCreateParams["voice"] = "alloy";

/**
 * OpenAI Text-to-Speech adapter — synchronous, returns MP3 buffer.
 */
export class OpenAiTtsAdapter implements AudioAdapter {
  readonly modelId = "tts-openai";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: AudioInput): Promise<AudioResult> {
    const voice = (input.voiceId ??
      DEFAULT_VOICE) as OpenAI.Audio.Speech.SpeechCreateParams["voice"];

    const response = await this.client.audio.speech.create({
      model: "tts-1",
      input: input.prompt,
      voice,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, ext: "mp3", contentType: "audio/mpeg" };
  }
}
