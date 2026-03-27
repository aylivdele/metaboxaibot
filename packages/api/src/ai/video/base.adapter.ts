export interface VideoInput {
  prompt: string;
  /** Source image URL for image-to-video generation */
  imageUrl?: string;
  /** Duration in seconds (provider-dependent) */
  duration?: number;
  /** e.g. "16:9", "9:16", "1:1" */
  aspectRatio?: string;
  /** User-configured model settings (from modelSettings storage). Each adapter picks what it supports. */
  modelSettings?: Record<string, unknown>;
  /** User ID — used by adapters that persist side-effects (e.g. saving created avatars). */
  userId?: bigint;
}

export interface VideoResult {
  /** Provider-returned video URL (temporary). Use s3Client to persist it. */
  url: string;
  /** Original filename hint for S3 upload */
  filename?: string;
}

/**
 * All video models are async:
 * submit() queues the job and returns a provider job ID.
 * poll()   checks for completion; returns null if still processing.
 */
export interface VideoAdapter {
  readonly modelId: string;
  /** Submit async job. Returns provider-side job / task ID. */
  submit(input: VideoInput): Promise<string>;
  /** Poll async result. Returns null if still processing. */
  poll(providerJobId: string): Promise<VideoResult | null>;
}
