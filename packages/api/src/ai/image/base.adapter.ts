export interface ImageInput {
  prompt: string;
  negativePrompt?: string;
  /** @deprecated Use mediaInputs instead for models with structured slots. */
  imageUrl?: string;
  /** Named media input slots: { [slotKey]: string[] } */
  mediaInputs?: Record<string, string[]>;
  width?: number;
  height?: number;
  /** Aspect ratio in "W:H" format, e.g. "16:9", "1:1". Each adapter converts to its own format. */
  aspectRatio?: string;
  /** User-configured model settings (from modelSettings storage). Each adapter picks what it supports. */
  modelSettings?: Record<string, unknown>;
}

export interface ImageResult {
  /** Provider-returned URL (temporary). Use s3Client to persist it. */
  url: string;
  /** Original filename hint for S3 upload */
  filename?: string;
  /** MIME content type, e.g. "image/png". Defaults to "image/jpeg" when absent. */
  contentType?: string;
  /** Actual output width in pixels (used for per-megapixel billing). */
  width?: number;
  /** Actual output height in pixels (used for per-megapixel billing). */
  height?: number;
  /**
   * Raw base64 image data returned by some providers (e.g. OpenAI Responses API).
   * When set, generation.service uploads it directly to S3 instead of fetching url.
   */
  base64Data?: string;
  /**
   * Exact provider USD cost calculated by the adapter from the pricing table.
   * Overrides calculateCost() when set.
   */
  providerUsdCost?: number;
}

/**
 * Sync adapter: generate() returns the result directly.
 * Async adapter: submit() queues the job and returns a provider job ID;
 * poll() checks for completion.
 */
export interface ImageAdapter {
  readonly modelId: string;
  readonly isAsync: boolean;
  /** Sync generation. Only implemented on sync adapters. May return an array for native batch (e.g. Recraft `n=2..6`). */
  generate?(input: ImageInput): Promise<ImageResult[] | ImageResult>;
  /** Submit async job. Returns provider-side job / prediction ID. */
  submit?(input: ImageInput): Promise<string>;
  /** Poll async result. Returns null if still processing. May return an array for batch generation. */
  poll?(providerJobId: string): Promise<ImageResult[] | ImageResult | null>;
}
