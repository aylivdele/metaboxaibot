/**
 * An error whose message is safe to show directly to the end user.
 *
 * If `key` is provided, the bot should translate it via `ctx.t.errors[key]`
 * and interpolate `params` (e.g. `{size}` → `params.size`), falling back to
 * the English `message` when the key is not found.
 */
export class UserFacingError extends Error {
  public readonly key?: string;
  public readonly params?: Record<string, string | number>;
  /**
   * When true, the worker should ALSO send a tech-channel alert despite
   * showing a friendly message to the user. Use for cases we want to keep
   * tracking (e.g. AI-classified provider errors that aren't yet hardcoded).
   */
  public readonly notifyOps?: boolean;

  constructor(
    message: string,
    options?: {
      key?: string;
      params?: Record<string, string | number>;
      notifyOps?: boolean;
      /**
       * Оригинальная ошибка, которую этот UserFacingError оборачивает.
       * Используется в notifyTechError — серилайзер развернёт цепочку
       * через `caused by:` и положит в alert полный traceback провайдера
       * (например, raw 429 body от kie/openai), не теряя контекст.
       */
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "UserFacingError";
    this.key = options?.key;
    this.params = options?.params;
    this.notifyOps = options?.notifyOps;
  }
}

/**
 * Thrown by an adapter's submit() when the input combination is structurally
 * incompatible with the provider, but another provider in the fallback chain
 * can handle it. submitWithFallback catches this and skips to the next candidate
 * without marking the key as errored or waiting for BullMQ retries.
 *
 * Example: KIE kling-3.0/video cannot accept image_urls + kling_elements
 * simultaneously, but evolink's kling-o3-image-to-video separates them into
 * image_start and image_urls and handles the combination correctly.
 */
export class ProviderInputIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderInputIncompatibleError";
  }
}

/**
 * Resolve a `UserFacingError` to a localised string.
 * `errorStrings` should be the `t.errors` object from the active locale.
 */
export function resolveUserFacingError(
  err: UserFacingError,
  errorStrings: Record<string, string>,
): string {
  if (err.key) {
    const template = errorStrings[err.key];
    if (template) {
      return Object.entries(err.params ?? {}).reduce(
        (s, [k, v]) => s.replace(`{${k}}`, String(v)),
        template,
      );
    }
  }
  return err.message;
}
