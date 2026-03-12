import type { VideoAdapter, VideoInput, VideoResult } from "./base.adapter.js";

const RUNWAY_API = "https://api.dev.runwayml.com/v1";

interface RunwayTask {
  id: string;
  status: string;
  output?: string[];
  failure?: string;
}

/**
 * RunwayML Gen-3 Alpha adapter (REST API).
 */
export class RunwayAdapter implements VideoAdapter {
  readonly modelId = "runway";

  private readonly apiKey: string;

  constructor(apiKey = process.env.RUNWAY_API_KEY ?? "") {
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    };
  }

  async submit(input: VideoInput): Promise<string> {
    const body: Record<string, unknown> = {
      promptText: input.prompt,
      model: "gen3a_turbo",
      ratio: input.aspectRatio ?? "1280:768",
      duration: input.duration ?? 5,
    };
    if (input.imageUrl) {
      body.promptImage = input.imageUrl;
    }

    const res = await fetch(`${RUNWAY_API}/image_to_video`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway submit failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async poll(taskId: string): Promise<VideoResult | null> {
    const res = await fetch(`${RUNWAY_API}/tasks/${taskId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway poll failed: ${res.status} ${text}`);
    }

    const task = (await res.json()) as RunwayTask;

    if (task.status === "FAILED") {
      throw new Error(`Runway task failed: ${task.failure ?? "unknown"}`);
    }
    if (task.status !== "SUCCEEDED") return null;

    const url = task.output?.[0];
    if (!url) throw new Error("Runway: no output URL in succeeded task");
    return { url, filename: "runway.mp4" };
  }
}
