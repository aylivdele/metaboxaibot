/**
 * An error whose message is safe to show directly to the end user.
 * Catch this in bot scenes and reply with `err.message` instead of a generic fallback.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
