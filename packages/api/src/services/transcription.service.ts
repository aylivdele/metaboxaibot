import OpenAI from "openai";
import { config } from "@metabox/shared";
import { transcodeOggToMp3 } from "../utils/audio-transcode.js";
import { logger } from "../logger.js";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: config.ai.openai });
  return client;
}

/**
 * Transcribes an audio buffer to text using OpenAI Whisper API.
 * Automatically transcodes OGG/Opus (Telegram voice) to MP3 before sending.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  language?: string,
): Promise<string> {
  const isOgg = mimeType.includes("ogg") || mimeType.includes("opus");
  const buffer = isOgg ? await transcodeOggToMp3(audioBuffer) : audioBuffer;
  const ext = isOgg ? "mp3" : (mimeType.split("/")[1]?.replace(/;.*/, "") ?? "mp3");

  const file = new File([buffer], `voice.${ext}`, { type: `audio/${ext}` });

  const result = await getClient().audio.transcriptions.create({
    model: "whisper-1",
    file,
    ...(language ? { language } : {}),
  });

  logger.debug({ language, textLength: result.text.length }, "transcribeAudio: done");
  return result.text;
}
