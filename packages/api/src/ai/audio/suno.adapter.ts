import { fal } from "@fal-ai/client";
import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

const SUNO_ENDPOINT = "fal-ai/suno-v4";

/**
 * Suno music generation adapter via FAL.ai — asynchronous.
 */
export class SunoAdapter implements AudioAdapter {
  readonly modelId = "suno";
  readonly isAsync = true;

  constructor(apiKey = config.ai.fal) {
    fal.config({ credentials: apiKey });
  }

  async submit(input: AudioInput): Promise<string> {
    const ms = input.modelSettings ?? {};
    const lyrics = (ms.lyrics as string | undefined) || undefined;
    const sunoInput: Record<string, unknown> = {
      prompt: input.prompt,
      make_instrumental: (ms.make_instrumental as boolean | undefined) ?? false,
      model_version: (ms.model_version as string | undefined) ?? "chirp-v4.5",
      wait_audio: false,
      ...(lyrics ? { lyric: lyrics } : {}),
    };
    logCall(SUNO_ENDPOINT, "submit", sunoInput);
    const { request_id } = await fal.queue.submit(SUNO_ENDPOINT, {
      input: sunoInput as Parameters<typeof fal.queue.submit>[1]["input"],
    });
    return request_id;
  }

  async poll(requestId: string): Promise<AudioResult | null> {
    const status = await fal.queue.status(SUNO_ENDPOINT, {
      requestId,
      logs: false,
    });

    if (status.status !== "COMPLETED") return null;

    const result = await fal.queue.result(SUNO_ENDPOINT, { requestId });
    const data = result.data as {
      audio_url?: string;
      clips?: Array<{ audio_url: string }>;
    };

    const url = data.audio_url ?? data.clips?.[0]?.audio_url;
    if (!url) throw new Error("Suno: no audio URL in result");
    return { url, ext: "mp3", contentType: "audio/mpeg" };
  }
}
