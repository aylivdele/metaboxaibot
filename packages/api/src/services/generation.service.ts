import { db } from "../db.js";
import { createImageAdapter } from "../ai/image/factory.js";
import { getImageQueue } from "../queues/image.queue.js";
import { AI_MODELS } from "@metabox/shared";
import { checkBalance, deductTokens, calculateCost } from "./token.service.js";
import {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadFromUrl,
  uploadBuffer,
  getFileUrl,
  generateThumbnail,
} from "./s3.service.js";
import { dialogService } from "./dialog.service.js";
import { userStateService } from "./user-state.service.js";
import { translatePromptIfNeeded } from "./prompt-translate.service.js";

/** Parse megapixels from modelSettings.size ("WxH") or width/height fields. */
function parseMegapixels(modelSettings: Record<string, unknown>): number | undefined {
  const size = modelSettings.size as string | undefined;
  if (size) {
    const [w, h] = size.split("x").map(Number);
    if (w && h) return (w * h) / 1_000_000;
  }
  const w = modelSettings.width as number | undefined;
  const h = modelSettings.height as number | undefined;
  if (w && h) return (w * h) / 1_000_000;
  return undefined;
}

export interface SubmitImageParams {
  userId: bigint;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  telegramChatId: number;
  /** If set, user/assistant messages are saved to this dialog for img2img context. */
  dialogId?: string;
  /** Pre-translated label for the "Send as file" inline button. */
  sendOriginalLabel?: string;
  /** Aspect ratio chosen by user, e.g. "16:9", "1:1". */
  aspectRatio?: string;
}

export interface SubmitImageResult {
  dbJobId: string;
  /** Populated immediately for sync models (dall-e). */
  imageUrl?: string;
  /** Original filename with extension (e.g. "recraft-v4.svg"). Set for sync models. */
  filename?: string;
  /** S3 key for the uploaded image. Set for sync models when upload succeeded. */
  s3Key?: string;
  isPending: boolean;
  /** Message.id of the saved assistant result (for "Refine" button). Only set for sync models when dialogId provided. */
  assistantMessageId?: string;
}

export const generationService = {
  async submitImage(params: SubmitImageParams): Promise<SubmitImageResult> {
    const {
      userId,
      modelId,
      prompt,
      negativePrompt,
      sourceImageUrl,
      telegramChatId,
      dialogId,
      sendOriginalLabel,
      aspectRatio,
    } = params;

    const model = AI_MODELS[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const allModelSettings = await userStateService.getModelSettings(userId);
    const modelSettings = allModelSettings[modelId] ?? {};
    // Prefer aspect_ratio from modelSettings (set via webapp) over legacy param
    const effectiveAspectRatio = (modelSettings.aspect_ratio as string | undefined) ?? aspectRatio;

    // For per-megapixel models assume 1 MP (typical for most image resolutions)
    const estimatedMegapixels = model.costUsdPerMPixel ? 1.0 : undefined;
    const estimatedCost = calculateCost(model, 0, 0, estimatedMegapixels, undefined, modelSettings);
    await checkBalance(userId, estimatedCost);

    const job = await db.generationJob.create({
      data: {
        userId,
        dialogId: dialogId ?? "",
        section: "image",
        modelId,
        prompt,
        inputData: negativePrompt ? { negativePrompt } : undefined,
        status: "pending",
      },
    });

    const adapter = createImageAdapter(modelId);

    if (!adapter.isAsync && adapter.generate) {
      // ── Sync generation (DALL-E 3) ──────────────────────────────────────
      try {
        const effectivePrompt = await translatePromptIfNeeded(prompt, modelSettings, userId);
        const result = await adapter.generate({
          prompt: effectivePrompt,
          negativePrompt,
          imageUrl: sourceImageUrl,
          aspectRatio: effectiveAspectRatio,
          modelSettings,
        });

        // Resolve final URL — for base64 providers, upload buffer to S3 synchronously
        let finalUrl = result.url;
        let s3KeySync: string | null = null;
        let thumbnailS3KeySync: string | null = null;
        if (result.base64Data) {
          const fmt = (modelSettings.output_format as string | undefined) ?? "png";
          const ext = fmt === "jpeg" ? "jpg" : fmt;
          const contentType =
            ext === "webp" ? "image/webp" : ext === "jpg" ? "image/jpeg" : "image/png";
          const key = buildS3Key("image", userId.toString(), job.id, ext);
          const buffer = Buffer.from(result.base64Data, "base64");
          s3KeySync = await uploadBuffer(key, buffer, contentType).catch(() => null);
          if (s3KeySync) {
            finalUrl = (await getFileUrl(s3KeySync)) ?? result.url;
            const thumbBuf = await generateThumbnail(buffer, contentType);
            if (thumbBuf) {
              thumbnailS3KeySync = await uploadBuffer(
                buildThumbnailKey(s3KeySync),
                thumbBuf,
                "image/webp",
              ).catch(() => null);
            }
          }
        }

        await db.generationJob.update({
          where: { id: job.id },
          data: {
            status: "done",
            outputUrl: finalUrl,
            s3Key: s3KeySync ?? undefined,
            thumbnailS3Key: thumbnailS3KeySync ?? undefined,
            completedAt: new Date(),
          },
        });

        const outputMegapixels = parseMegapixels(modelSettings);
        await deductTokens(
          userId,
          calculateCost(model, 0, 0, outputMegapixels, undefined, modelSettings),
          modelId,
        );

        // Save messages to dialog for img2img context
        let assistantMessageId: string | undefined;
        if (dialogId && finalUrl) {
          await dialogService.saveMessage(dialogId, "user", prompt);
          const assistantMsg = await dialogService.saveMessage(dialogId, "assistant", "", {
            mediaUrl: finalUrl,
            mediaType: "image",
          });
          assistantMessageId = assistantMsg.id;
        }

        // Upload to S3 for non-base64 providers (synchronous so caller can use the S3 key)
        if (!result.base64Data && finalUrl) {
          const isSvg = result.filename?.endsWith(".svg") ?? false;
          const { ext: defaultExt, contentType: defaultContentType } = sectionMeta("image");
          const ext = isSvg ? "svg" : defaultExt;
          const contentType = isSvg ? "image/svg+xml" : defaultContentType;
          const key = buildS3Key("image", userId.toString(), job.id, ext);
          // Download into buffer to enable thumbnail generation
          let imageBuffer: Buffer | null = null;
          try {
            const res = await fetch(finalUrl);
            if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
          } catch {
            /* non-fatal */
          }
          const uploadedKey = imageBuffer
            ? await uploadBuffer(key, imageBuffer, contentType).catch(() => null)
            : await uploadFromUrl(key, finalUrl, contentType).catch(() => null);
          if (uploadedKey) {
            s3KeySync = uploadedKey;
            const thumbBuf = imageBuffer ? await generateThumbnail(imageBuffer, contentType) : null;
            thumbnailS3KeySync = thumbBuf
              ? await uploadBuffer(buildThumbnailKey(s3KeySync), thumbBuf, "image/webp").catch(
                  () => null,
                )
              : null;
            await db.generationJob.update({
              where: { id: job.id },
              data: { s3Key: s3KeySync, thumbnailS3Key: thumbnailS3KeySync ?? undefined },
            });
          }
        }

        return {
          dbJobId: job.id,
          imageUrl: finalUrl,
          filename: result.filename,
          s3Key: s3KeySync ?? undefined,
          isPending: false,
          assistantMessageId,
        };
      } catch (err) {
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "failed", error: String(err) },
        });
        throw err;
      }
    }

    // ── Async generation — enqueue for worker ─────────────────────────────
    const queue = getImageQueue();
    await queue.add(
      "generate",
      {
        dbJobId: job.id,
        userId: userId.toString(),
        modelId,
        prompt,
        negativePrompt,
        sourceImageUrl,
        telegramChatId,
        dialogId,
        sendOriginalLabel,
        aspectRatio: effectiveAspectRatio,
        modelSettings,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return { dbJobId: job.id, isPending: true };
  },
};
