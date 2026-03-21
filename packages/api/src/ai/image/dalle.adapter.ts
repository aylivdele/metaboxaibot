import OpenAI from "openai";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";

/**
 * DALL-E adapter — synchronous, returns URL immediately.
 * When input.imageUrl is provided, uses DALL-E 2 createVariation for img2img.
 * Otherwise uses DALL-E 3 generate.
 */
export class DalleAdapter implements ImageAdapter {
  readonly modelId = "dall-e-3";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = config.ai.openai) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: ImageInput): Promise<ImageResult> {
    // img2img: use DALL-E 2 variations when a reference image URL is provided
    if (input.imageUrl) {
      return this.generateVariation(input.imageUrl);
    }

    const DALLE_SIZES: Record<string, "1024x1024" | "1792x1024" | "1024x1792"> = {
      "1:1": "1024x1024",
      "16:9": "1792x1024",
      "9:16": "1024x1792",
    };
    const size = DALLE_SIZES[input.aspectRatio ?? ""] ?? "1024x1024";

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

  private async generateVariation(imageUrl: string): Promise<ImageResult> {
    // Download the reference image as a Buffer for the DALL-E 2 variations API
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Failed to fetch reference image: ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // The SDK accepts a File-like object; we create one from the buffer
    const file = new File([buffer], "reference.png", { type: "image/png" });

    const response = await this.client.images.createVariation({
      model: "dall-e-2",
      image: file,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const url = response.data?.[0]?.url;
    if (!url) throw new Error("DALL-E 2 variation returned no image URL");
    return { url, filename: "dalle2-variation.png" };
  }
}
