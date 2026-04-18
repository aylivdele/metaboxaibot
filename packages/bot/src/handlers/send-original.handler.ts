import type { BotContext } from "../types/context.js";
import { db } from "@metabox/api/db";
import { getFileUrl } from "@metabox/api/services/s3";

/**
 * Callback handler for "📎 Send as file" buttons (callback_data: orig_<outputId>).
 * Looks up the GenerationJobOutput and resends the output as an uncompressed document.
 * Also supports legacy orig_<jobId> buttons from before the migration.
 */
export async function handleSendOriginal(ctx: BotContext): Promise<void> {
  const id = ctx.callbackQuery?.data?.replace("orig_", "") ?? "";

  if (!ctx.user || !id) {
    await ctx.answerCallbackQuery();
    return;
  }

  // Try as outputId first
  let output = await db.generationJobOutput.findUnique({
    where: { id },
    include: { job: { select: { userId: true } } },
  });

  // Fallback: treat as jobId (old buttons before migration)
  if (!output) {
    output = await db.generationJobOutput.findFirst({
      where: { jobId: id, index: 0 },
      include: { job: { select: { userId: true } } },
    });
  }

  if (!output || output.job.userId !== ctx.user.id) {
    await ctx.answerCallbackQuery();
    return;
  }

  // Prefer a fresh S3 URL; fall back to provider URL
  const url = (output.s3Key ? await getFileUrl(output.s3Key) : null) ?? output.outputUrl;

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
