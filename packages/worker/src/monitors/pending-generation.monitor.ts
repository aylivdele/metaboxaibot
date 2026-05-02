import { pendingGenerationService } from "@metabox/api/services";
import { logger } from "../logger.js";

/**
 * Periodic sweep: drops PendingGeneration rows past their `expiresAt`.
 * Кнопки "Начать"/"Отмена" в чате становятся обработчиком "Запрос устарел"
 * через сверку существования строки — этот клинап нужен только чтобы DB
 * не копила мусор от пользователей, забивших на подтверждение.
 */
export async function runPendingGenerationCleanup(): Promise<{ deleted: number }> {
  const deleted = await pendingGenerationService.cleanupExpired();
  if (deleted > 0) {
    logger.info({ deleted }, "PendingGeneration: removed expired rows");
  }
  return { deleted };
}
