import OpenAI from "openai";
import type { ImageAdapter, ImageInput, ImageResult } from "./base.adapter.js";
import { config } from "@metabox/shared";
import { logCall } from "../../utils/fetch.js";

/** USD cost per image by quality × size. */
const COST_TABLE: Record<string, Record<string, number>> = {
  low: { "1024x1024": 0.009, "1024x1536": 0.013, "1536x1024": 0.013 },
  medium: { "1024x1024": 0.034, "1024x1536": 0.05, "1536x1024": 0.05 },
  high: { "1024x1024": 0.133, "1024x1536": 0.2, "1536x1024": 0.2 },
};

/**
 * GPT Image adapter — uses OpenAI Responses API with image_generation tool.
 * Returns raw base64 data (no public URL) so generation.service uploads to S3.
 */
export class GptImageAdapter implements ImageAdapter {
  readonly modelId = "gpt-image-1.5";
  readonly isAsync = false;

  private client: OpenAI;

  constructor(apiKey = config.ai.openai) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: ImageInput): Promise<ImageResult> {
    const ms = input.modelSettings ?? {};
    const quality = (ms.quality as string | undefined) ?? "medium";
    const size = (ms.size as string | undefined) ?? "1024x1024";
    const outputFormat = (ms.output_format as string | undefined) ?? "png";
    const outputCompression = ms.output_compression as number | undefined;
    const background = ms.background as string | undefined;
    const moderation = ms.moderation as string | undefined;

    const tool: Record<string, unknown> = {
      type: "image_generation",
      quality,
      size,
      output_format: outputFormat,
    };
    if (outputCompression !== undefined) tool.output_compression = outputCompression;
    if (background && background !== "auto") tool.background = background;
    if (moderation && moderation !== "auto") tool.moderation = moderation;

    // When a source image is provided, include it as reference for editing/refining
    const apiInput: unknown = input.imageUrl
      ? [
          { type: "input_image", image_url: input.imageUrl, detail: "high" },
          { type: "input_text", text: input.prompt },
        ]
      : input.prompt;

    logCall("gpt-image-1", "generate", {
      quality,
      size,
      output_format: outputFormat,
      has_image: !!input.imageUrl,
    });
    const response = await (
      this.client.responses.create as (p: unknown) => Promise<{
        output: Array<{ type: string; result?: string }>;
      }>
    )({
      model: "gpt-image-1",
      input: apiInput,
      tools: [tool],
    });

    const imageItem = response.output.find((item) => item.type === "image_generation_call");
    if (!imageItem?.result) throw new Error("gpt-image: no image_generation_call in response");

    const base64Data = imageItem.result;
    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    const providerUsdCost = COST_TABLE[quality]?.[size] ?? COST_TABLE.medium["1024x1024"];

    return {
      url: `data:image/${ext};base64,${base64Data}`,
      filename: `gpt-image.${ext}`,
      base64Data,
      providerUsdCost,
    };
  }
}
