/**
 * Resolves a provider error to a user-facing message, or returns null
 * if the error is technical/unknown (should trigger a tech alert instead).
 */

import { hasFalUserFacingError, getFalUserMessage } from "@metabox/api/utils/fal-error";
import { isHeyGenUserFacingError, getHeyGenUserMessage } from "@metabox/api/utils/heygen-error";
import { isLumaUserFacingError, getLumaUserMessage } from "@metabox/api/utils/luma-error";
import { isMinimaxUserFacingError, getMinimaxUserMessage } from "@metabox/api/utils/minimax-error";
import { isRunwayUserFacingError, getRunwayUserMessage } from "@metabox/api/utils/runway-error";
import {
  isReplicateUserFacingError,
  getReplicateUserMessage,
} from "@metabox/api/utils/replicate-error";
import { type Translations, UserFacingError, resolveUserFacingError } from "@metabox/shared";

export function resolveUserFacingMessage(err: unknown, t: Translations): string | null {
  if (err instanceof UserFacingError) return resolveUserFacingError(err, t.errors);
  if (isHeyGenUserFacingError(err)) return getHeyGenUserMessage(err, t);
  if (isRunwayUserFacingError(err)) return getRunwayUserMessage(err, t);
  if (isMinimaxUserFacingError(err)) return getMinimaxUserMessage(err, t);
  if (isLumaUserFacingError(err)) return getLumaUserMessage(err, t);
  if (isReplicateUserFacingError(err)) return getReplicateUserMessage(err, t);
  if (hasFalUserFacingError(err))
    return getFalUserMessage(err, t) ?? t.errors.contentPolicyViolation;
  return null;
}

/**
 * Returns true when a user-facing error should ALSO send a tech-channel alert
 * (e.g. AI-classified provider errors that we want to keep tracking until we
 * add a hardcoded handler for them).
 */
export function shouldNotifyOps(err: unknown): boolean {
  return err instanceof UserFacingError && err.notifyOps === true;
}
