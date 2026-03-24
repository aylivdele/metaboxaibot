import OpenAI from "openai";
import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

const DEFAULT_VOICE: OpenAI.Audio.Speech.SpeechCreateParams["voice"] = "alloy";

/**
 * OpenAI Text-to-Speech adapter — synchronous, returns MP3 buffer.
 */
export class OpenAiTtsAdapter implements AudioAdapter {
  readonly modelId = "tts-openai";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = config.ai.openai) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: AudioInput): Promise<AudioResult> {
    const ms = input.modelSettings ?? {};
    const voice = ((ms.voice as string | undefined) ??
      input.voiceId ??
      DEFAULT_VOICE) as OpenAI.Audio.Speech.SpeechCreateParams["voice"];
    const speed = (ms.speed as number | undefined) ?? 1.0;
    const format = ((ms.format as string | undefined) ??
      "mp3") as OpenAI.Audio.Speech.SpeechCreateParams["response_format"];

    const response = await this.client.audio.speech.create({
      model: "tts-1",
      input: input.prompt,
      voice,
      speed,
      response_format: format,
    });

    const ext = format === "opus" ? "ogg" : format === "aac" ? "aac" : format === "flac" ? "flac" : "mp3";
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, ext, contentType: `audio/${ext === "mp3" ? "mpeg" : ext}` };
  }
}
