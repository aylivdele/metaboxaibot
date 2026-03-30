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

  constructor(
    message: string,
    options?: { key?: string; params?: Record<string, string | number> },
  ) {
    super(message);
    this.name = "UserFacingError";
    this.key = options?.key;
    this.params = options?.params;
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
