import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const APIPASS_BASE = "https://api.apipass.net";

interface SunoClip {
  id: string;
  audio_url?: string;
  status?: string;
}

/**
 * Suno music generation adapter via apipass.net proxy.
 * Uses the unofficial Suno API format mirrored by apipass.
 * Docs: https://apipass.net
 */
export class ApipassSunoAdapter implements AudioAdapter {
  readonly modelId = "suno";
  readonly isAsync = true;

  async submit(input: AudioInput): Promise<string> {
    const apiKey = config.ai.apipass;
    if (!apiKey) throw new Error("APIPASS_API_KEY not configured");

    const ms = input.modelSettings ?? {};

    const resp = await fetchWithLog(`${APIPASS_BASE}/api/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gpt_description_prompt: input.prompt,
        make_instrumental: (ms.make_instrumental as boolean | undefined) ?? false,
        mv: "chirp-v4",
        wait_audio: false,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Apipass Suno error ${resp.status}: ${txt}`);
    }

    const clips = (await resp.json()) as SunoClip[];
    const id = clips?.[0]?.id;
    if (!id) throw new Error("Apipass Suno: no task ID in response");
    return id;
  }

  async poll(clipId: string): Promise<AudioResult | null> {
    const apiKey = config.ai.apipass;
    if (!apiKey) throw new Error("APIPASS_API_KEY not configured");

    const resp = await fetchWithLog(`${APIPASS_BASE}/api/get?ids=${encodeURIComponent(clipId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) throw new Error(`Apipass Suno poll error ${resp.status}`);

    const clips = (await resp.json()) as SunoClip[];
    const clip = clips?.[0];
    if (!clip) throw new Error("Apipass Suno: empty poll response");

    if (clip.status !== "complete" && clip.status !== "streaming") return null;

    const url = clip.audio_url;
    if (!url) return null;

    return { url, ext: "mp3", contentType: "audio/mpeg" };
  }
}
