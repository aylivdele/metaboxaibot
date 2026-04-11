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
 * Describes a precondition violation detected before submission.
 * `key` is resolved against `t.video.*` in the bot layer and optionally
 * formatted with `params`. Adapters return this from `validateRequest`
 * to abort generation with a clear, localized message.
 */
export interface VideoValidationError {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Extra context the bot layer passes to `validateRequest` that is not
 * already part of `VideoInput` (e.g. whether a raw voice recording is
 * attached for lip-sync).
 */
export interface VideoValidationContext {
  /** True when a raw voice file / recording will be passed to the adapter. */
  hasVoiceFile?: boolean;
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
  /**
   * Optional: fetch video bytes from the provider URL.
   * Implement when the URL requires authentication headers that the worker doesn't have.
   * If absent, the worker performs a plain unauthenticated fetch.
   */
  fetchBuffer?(url: string): Promise<Buffer>;
  /**
   * Optional: validate the request before it is queued. Return `null` when
   * the request is acceptable, or a `VideoValidationError` describing a
   * user-facing precondition violation (e.g. missing avatar, incompatible
   * duration for a given input image). The bot layer resolves the `key`
   * against `t.video.*` and replies without ever reaching `submit()`.
   */
  validateRequest?(input: VideoInput, ctx?: VideoValidationContext): VideoValidationError | null;
}
