import OpenAI from "openai";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";

/**
 * DALL-E 3 adapter — synchronous, returns URL immediately.
 */
export class DalleAdapter implements ImageAdapter {
  readonly modelId = "dall-e-3";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: ImageInput): Promise<ImageResult> {
    const size =
      input.width && input.height
        ? (`${input.width}x${input.height}` as "1024x1024" | "1792x1024" | "1024x1792")
        : "1024x1024";

    const response = await this.client.images.generate({
      model: "dall-e-3",
      prompt: input.prompt,
      n: 1,
      size,
      quality: "standard",
      response_format: "url",
    });

    const url = response.data?.[0]?.url;
    if (!url) throw new Error("DALL-E returned no image URL");
    return { url, filename: "dalle3.png" };
  }
}
