import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { getFileUrl } from "../../services/s3.service.js";
import { fetchWithLog } from "../../utils/fetch.js";

const DID_API = "https://api.d-id.com";

interface DIDTalk {
  id: string;
  status: string;
  result_url?: string;
  error?: { description: string };
}

/**
 * D-ID talking-head adapter (REST API).
 * Uses a source image URL (or default presenter) + the prompt as TTS script.
 */
export class DIDAdapter implements VideoAdapter {
  readonly modelId = "d-id";

  private readonly apiKey: string;
  /** Default presenter image used when no sourceImage is provided */
  private readonly defaultPresenterUrl: string;

  constructor(
    apiKey = config.ai.did ?? "",
    defaultPresenterUrl = config.ai.didPresenterUrl ??
      "https://d-id-public-bucket.s3.amazonaws.com/alice.jpg",
  ) {
    this.apiKey = apiKey;
    this.defaultPresenterUrl = defaultPresenterUrl;
  }

  private headers() {
    // D-ID uses Basic auth with the API key as the username
    const encoded = Buffer.from(`${this.apiKey}:`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const sentiment = (input.modelSettings?.sentiment as string | undefined) ?? "neutral";
    const driverUrl = input.modelSettings?.driver_url as string | undefined;

    const voiceS3Key = input.modelSettings?.voice_s3key as string | undefined;
    const voiceUrlStored = input.modelSettings?.voice_url as string | undefined;
    let voiceUrl: string | undefined = voiceUrlStored || undefined;
    if (voiceS3Key) {
      voiceUrl = (await getFileUrl(voiceS3Key).catch(() => null)) ?? voiceUrl;
    }
    const voiceId = (input.modelSettings?.voice_id as string | undefined) || "en-US-JennyNeural";
    const voiceProvider =
      (input.modelSettings?.voice_provider as string | undefined) || "microsoft";

    const script: Record<string, unknown> = voiceUrl
      ? { type: "audio", audio_url: voiceUrl }
      : { type: "text", input: input.prompt, provider: { type: voiceProvider, voice_id: voiceId } };

    const body: Record<string, unknown> = {
      source_url: input.imageUrl ?? this.defaultPresenterUrl,
      script,
      config: {
        fluent: true,
        pad_audio: 0,
        ...(sentiment !== "neutral" && {
          expressions: [{ start_frame: 0, expression: sentiment, intensity: 1.0 }],
        }),
      },
      ...(driverUrl ? { driver_url: driverUrl } : {}),
    };

    const res = await fetchWithLog(`${DID_API}/talks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`D-ID submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async poll(talkId: string): Promise<VideoResult | null> {
    const res = await fetchWithLog(`${DID_API}/talks/${talkId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`D-ID poll failed: ${res.status} ${text}`);
    }

    const talk = (await res.json()) as DIDTalk;

    if (talk.status === "error") {
      throw new Error(`D-ID talk failed: ${talk.error?.description ?? "unknown"}`);
    }
    if (talk.status !== "done") return null;

    const url = talk.result_url;
    if (!url) throw new Error("D-ID: no result_url in done talk");
    return { url, filename: "d-id.mp4" };
  }
}
