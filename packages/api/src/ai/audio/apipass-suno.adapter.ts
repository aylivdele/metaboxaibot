import type { AudioAdapter, AudioInput, AudioResult } from "./base.adapter.js";
import { config, UserFacingError } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const SUNOAPI_BASE = "https://api.sunoapi.org";

/** Model version mapping from internal setting values to sunoapi.org model names */
const MODEL_MAP: Record<string, string> = {
  V4: "V4",
  V4_5: "V4_5",
  V4_5PLUS: "V4_5PLUS",
  V5: "V5",
  V5_5: "V5_5",
};

interface SunoGenerateResponse {
  code: number;
  msg: string;
  data?: { taskId: string };
}

interface SunoTrack {
  id?: string;
  audioUrl?: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  title?: string;
  duration?: number;
}

interface SunoPollResponse {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    status?: string;
    errorCode?: number | null;
    errorMessage?: string | null;
    response?: {
      sunoData?: SunoTrack[];
    };
  };
}

/**
 * Suno music generation adapter via sunoapi.org.
 * Docs: https://sunoapi.org
 */
export class ApipassSunoAdapter implements AudioAdapter {
  readonly modelId = "suno";
  readonly isAsync = true;

  async submit(input: AudioInput): Promise<string> {
    const apiKey = config.ai.apipass;
    if (!apiKey) throw new Error("APIPASS_API_KEY not configured");

    const ms = input.modelSettings ?? {};
    const lyrics = (ms.lyrics as string | undefined)?.trim() || undefined;
    const instrumental = (ms.make_instrumental as boolean | undefined) ?? false;
    const modelVersion = (ms.model_version as string | undefined) ?? "V4_5";
    const model = MODEL_MAP[modelVersion] ?? "V4_5";

    // sunoapi.org requires callBackUrl — we use polling so any reachable URL works
    const callBackUrl = `${config.api.publicUrl ?? "https://example.com"}/suno-callback`;

    let body: Record<string, unknown>;
    if (!instrumental && lyrics) {
      // Custom mode: user provides lyrics — prompt becomes the lyrics, style is the description
      body = {
        customMode: true,
        instrumental: false,
        model,
        style: input.prompt,
        title: "Track",
        prompt: lyrics,
        callBackUrl,
      };
    } else {
      // Non-custom mode: description-only generation
      body = {
        customMode: false,
        instrumental,
        model,
        prompt: input.prompt,
        callBackUrl,
      };
    }

    const resp = await fetchWithLog(`${SUNOAPI_BASE}/api/v1/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Suno API error ${resp.status}: ${txt}`);
    }

    const data = (await resp.json()) as SunoGenerateResponse;
    if (data.code !== 200 || !data.data?.taskId) {
      const msg = data.msg ?? "no taskId in response";
      if (/cannot exceed \d+ characters/i.test(msg)) {
        const match = msg.match(/exceed\s+(\d+)\s+characters/i);
        const max = match ? Number(match[1]) : 500;
        throw new UserFacingError(`Suno API: ${msg}`, {
          key: "sunoPromptTooLong",
          params: { max, current: input.prompt.length },
        });
      }
      throw new Error(`Suno API: ${msg}`);
    }
    return data.data.taskId;
  }

  async poll(taskId: string): Promise<AudioResult | null> {
    const apiKey = config.ai.apipass;
    if (!apiKey) throw new Error("APIPASS_API_KEY not configured");

    const resp = await fetchWithLog(
      `${SUNOAPI_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!resp.ok) throw new Error(`Suno API poll error ${resp.status}`);

    const body = (await resp.json()) as SunoPollResponse;
    const taskData = body.data;
    const status = taskData?.status;

    // Terminal error statuses
    if (
      status === "GENERATE_AUDIO_FAILED" ||
      status === "CREATE_TASK_FAILED" ||
      status === "SENSITIVE_WORD_ERROR"
    ) {
      throw new Error(`Suno generation failed: ${status} ${taskData?.errorMessage ?? ""}`);
    }

    // Not ready yet
    if (status !== "SUCCESS" && status !== "FIRST_SUCCESS") return null;

    const track = taskData?.response?.sunoData?.[0];
    if (!track) return null;

    const url = track.streamAudioUrl ?? track.audioUrl;
    if (!url) return null;

    return { url, ext: "mp3", contentType: "audio/mpeg" };
  }
}
