export interface ImageInput {
  prompt: string;
  negativePrompt?: string;
  /** Source image URL for img2img */
  imageUrl?: string;
  width?: number;
  height?: number;
}

export interface ImageResult {
  /** Provider-returned URL (temporary). Use s3Client to persist it. */
  url: string;
  /** Original filename hint for S3 upload */
  filename?: string;
}

/**
 * Sync adapter: generate() returns the result directly.
 * Async adapter: submit() queues the job and returns a provider job ID;
 * poll() checks for completion.
 */
export interface ImageAdapter {
  readonly modelId: string;
  readonly isAsync: boolean;
  /** Sync generation. Only implemented on sync adapters. */
  generate?(input: ImageInput): Promise<ImageResult>;
  /** Submit async job. Returns provider-side job / prediction ID. */
  submit?(input: ImageInput): Promise<string>;
  /** Poll async result. Returns null if still processing. */
  poll?(providerJobId: string): Promise<ImageResult | null>;
}
