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

export function resolveUserFacingMessage(err: unknown, falFallback: string): string | null {
  if (isHeyGenUserFacingError(err)) return getHeyGenUserMessage(err);
  if (isRunwayUserFacingError(err)) return getRunwayUserMessage(err);
  if (isMinimaxUserFacingError(err)) return getMinimaxUserMessage(err);
  if (isLumaUserFacingError(err)) return getLumaUserMessage(err);
  if (isReplicateUserFacingError(err)) return getReplicateUserMessage(err);
  if (hasFalUserFacingError(err)) return getFalUserMessage(err) ?? falFallback;
  return null;
}
