import type { BotContext } from "../types/context.js";
import { db } from "@metabox/api/db";
import { getFileUrl } from "@metabox/api/services/s3";

/**
 * Callback handler for "📎 Send as file" buttons (callback_data: orig_<dbJobId>).
 * Looks up the GenerationJob and resends the output as an uncompressed document.
 */
export async function handleSendOriginal(ctx: BotContext): Promise<void> {
  const dbJobId = ctx.callbackQuery?.data?.replace("orig_", "") ?? "";

  if (!ctx.user || !dbJobId) {
    await ctx.answerCallbackQuery();
    return;
  }

  const job = await db.generationJob.findUnique({
    where: { id: dbJobId },
    select: { userId: true, outputUrl: true, s3Key: true },
  });

  if (!job || job.userId !== ctx.user.id) {
    await ctx.answerCallbackQuery();
    return;
  }

  // Prefer a fresh S3 URL; fall back to provider URL
  const url = (job.s3Key ? await getFileUrl(job.s3Key) : null) ?? job.outputUrl;

  if (!url) {
    await ctx.answerCallbackQuery();
    return;
  }

  await ctx.answerCallbackQuery();
  const message = await ctx.replyWithDocument(url).catch(() => undefined);
  if (!message) {
    await ctx.reply(ctx.t.errors.sendOriginalFailed);
  }
}
