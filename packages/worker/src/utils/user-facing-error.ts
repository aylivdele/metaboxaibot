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
import type { Translations } from "@metabox/shared";

export function resolveUserFacingMessage(err: unknown, t: Translations): string | null {
  if (isHeyGenUserFacingError(err)) return getHeyGenUserMessage(err, t);
  if (isRunwayUserFacingError(err)) return getRunwayUserMessage(err, t);
  if (isMinimaxUserFacingError(err)) return getMinimaxUserMessage(err, t);
  if (isLumaUserFacingError(err)) return getLumaUserMessage(err, t);
  if (isReplicateUserFacingError(err)) return getReplicateUserMessage(err, t);
  if (hasFalUserFacingError(err))
    return getFalUserMessage(err, t) ?? t.errors.contentPolicyViolation;
  return null;
}
