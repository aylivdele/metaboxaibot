import type { Job } from "bullmq";
import { Api } from "grammy";
import type { ImageJobData } from "@metabox/api/queues";
import { db } from "@metabox/api/db";
import { createImageAdapter } from "@metabox/api/ai/image";
import { deductTokens, calculateCost } from "@metabox/api/services";
import { buildS3Key, sectionMeta, uploadFromUrl } from "@metabox/api/services/s3";
import { logger } from "../logger.js";
import { config, AI_MODELS } from "@metabox/shared";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 120; // 6 minutes max

const telegram = new Api(config.bot.token);

export async function processImageJob(job: Job<ImageJobData>): Promise<void> {
  const {
    dbJobId,
    userId: userIdStr,
    modelId,
    prompt,
    negativePrompt,
    telegramChatId,
    dialogId,
    sendOriginalLabel,
    aspectRatio,
  } = job.data;

  logger.info({ dbJobId, modelId }, "Processing image job");

  await db.generationJob.update({
    where: { id: dbJobId },
    data: { status: "processing" },
  });

  const adapter = createImageAdapter(modelId);

  try {
    if (!adapter.submit) throw new Error(`Adapter ${modelId} has no submit()`);
    const providerJobId = await adapter.submit({
      prompt,
      negativePrompt,
      imageUrl: job.data.sourceImageUrl,
      aspectRatio,
    });

    let imageResult = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);
      imageResult = await adapter.poll!(providerJobId);
      if (imageResult) break;
    }

    if (!imageResult) {
      throw new Error(`Timed out waiting for ${modelId} job ${providerJobId}`);
    }

    const isSvg = imageResult.filename?.endsWith(".svg") ?? false;
    const { ext, contentType } = isSvg
      ? { ext: "svg", contentType: "image/svg+xml" }
      : sectionMeta("image");
    const s3Key = await uploadFromUrl(
      buildS3Key("image", userIdStr, dbJobId, ext),
      imageResult.url,
      contentType,
    ).catch(() => null);

    await db.generationJob.update({
      where: { id: dbJobId },
      data: { status: "done", outputUrl: imageResult.url, s3Key, completedAt: new Date() },
    });

    const model = AI_MODELS[modelId];
    if (model) {
      const megapixels =
        model.costUsdPerMPixel && imageResult.width && imageResult.height
          ? (imageResult.width * imageResult.height) / 1_000_000
          : undefined;
      await deductTokens(BigInt(userIdStr), calculateCost(model, 0, 0, megapixels), modelId);
    }

    // Save messages to dialog and get assistantMessageId for Refine button
    let assistantMessageId: string | undefined;
    if (dialogId) {
      await db.message.create({
        data: { dialogId, role: "user", content: prompt, tokensUsed: 0 },
      });
      const assistantMsg = await db.message.create({
        data: {
          dialogId,
          role: "assistant",
          content: "",
          mediaUrl: imageResult.url,
          mediaType: "image",
          tokensUsed: 0,
        },
      });
      assistantMessageId = assistantMsg.id;
    }

    // Build inline keyboard: optional Refine row + optional Send as file row
    const refineRow =
      model?.supportsImages && assistantMessageId
        ? [{ text: "🔄 Доработать", callback_data: `design_ref_${assistantMessageId}` }]
        : null;
    const origRow = sendOriginalLabel
      ? [{ text: sendOriginalLabel, callback_data: `orig_${dbJobId}` }]
      : null;
    const rows = [refineRow, origRow].filter(Boolean) as {
      text: string;
      callback_data: string;
    }[][];
    const replyMarkup = rows.length ? { inline_keyboard: rows } : undefined;

    if (isSvg) {
      await telegram.sendDocument(telegramChatId, imageResult.url, {
        caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
        reply_markup: replyMarkup,
      });
    } else {
      await telegram.sendPhoto(telegramChatId, imageResult.url, {
        caption: `✅ ${modelId}: ${prompt.slice(0, 200)}`,
        reply_markup: replyMarkup,
      });
    }

    logger.info({ dbJobId }, "Image job completed");
  } catch (err) {
    logger.error({ dbJobId, err }, "Image job failed");

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      await db.generationJob.update({
        where: { id: dbJobId },
        data: { status: "failed", error: String(err) },
      });

      await telegram
        .sendMessage(
          telegramChatId,
          "❌ Ошибка при генерации, попробуйте позже или обратитесь в поддержку.",
        )
        .catch(() => void 0);
    }

    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
