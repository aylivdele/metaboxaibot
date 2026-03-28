import type { BotContext } from "../types/context.js";
import { chatService, dialogService, userStateService } from "@metabox/api/services";
import { logger } from "../logger.js";
import { config } from "@metabox/shared";
import { InlineKeyboard } from "grammy";

/** Media group buffer: groups multiple photos sent at once before processing. */
interface MediaGroupEntry {
  dialogId: string;
  userId: bigint;
  chatId: number;
  urls: string[];
  caption: string;
  ctx: BotContext;
  timer: ReturnType<typeof setTimeout>;
}
const mediaGroupBuffer = new Map<string, MediaGroupEntry>();

/** Default model for new GPT dialogs (user can change via Management). */
const DEFAULT_GPT_MODEL = "gpt-4o";
/** Minimum ms between Telegram message edits (rate-limit safety). */
const EDIT_THROTTLE_MS = 1200;
/** Finalize current message and start a new one when accumulated text reaches this length. */
const MSG_SPLIT_AT = 3800;

/**
 * Closes any unclosed Markdown markers so that a partial streaming response
 * is always valid for Telegram's Markdown parser.
 * Priority: ``` → ` → * → _
 */
function closeOpenMarkdown(text: string): string {
  // 1. Close unclosed triple-backtick code block
  if ((text.match(/```/g) ?? []).length % 2 !== 0) {
    return text + "\n```";
  }

  // Strip complete code blocks/inline code before counting remaining markers
  const noBlocks = text.replace(/```[\s\S]*?```/g, "");
  const noInline = noBlocks.replace(/`[^`\n]*`/g, "");

  // 2. Close unclosed inline backtick
  if ((noBlocks.match(/`/g) ?? []).length % 2 !== 0) {
    return text + "`";
  }

  // 3. Close unclosed bold/italic asterisk
  if ((noInline.match(/\*/g) ?? []).length % 2 !== 0) {
    return text + "*";
  }

  // 4. Close unclosed italic underscore
  if ((noInline.match(/_/g) ?? []).length % 2 !== 0) {
    return text + "_";
  }

  return text;
}

/** Strip <think>...</think> blocks. During streaming, also hides an unclosed partial block. */
function stripThinkingBlocks(text: string): string {
  let result = text.replace(/\s*<think>[\s\S]*?<\/think>\s*/g, "");
  const openIdx = result.indexOf("<think>");
  if (openIdx !== -1) result = result.slice(0, openIdx);
  return result.trim();
}

// ── Shared streaming helper ───────────────────────────────────────────────────

async function streamGptResponse(
  ctx: BotContext,
  chatId: number,
  dialogId: string,
  content: string,
  imageUrls?: string[],
): Promise<void> {
  let placeholder = await ctx.reply("⏳");
  let accumulated = "";
  let lastEdit = Date.now();

  const finalizeMessage = async (msgId: number, text: string) => {
    await ctx.api
      .editMessageText(chatId, msgId, text, { parse_mode: "Markdown" })
      .catch(async (err) => {
        logger.warn(err, "GPT finalize: markdown parse failed, retrying as plain text");
        await ctx.api
          .editMessageText(chatId, msgId, text)
          .catch((e) => logger.error(e, "GPT finalize: plain text fallback also failed"));
      });
  };

  try {
    const stream = chatService.sendMessageStream({
      dialogId,
      userId: ctx.user!.id,
      content,
      ...(imageUrls?.length ? { imageUrls } : {}),
    });

    for await (const chunk of stream) {
      accumulated += chunk;

      // Split into a new message when approaching Telegram's 4096-char limit
      if (accumulated.length >= MSG_SPLIT_AT) {
        await finalizeMessage(placeholder.message_id, closeOpenMarkdown(stripThinkingBlocks(accumulated)));
        placeholder = await ctx.reply("⏳");
        accumulated = "";
        lastEdit = Date.now();
        continue;
      }

      const now = Date.now();
      if (now - lastEdit >= EDIT_THROTTLE_MS && accumulated.trim()) {
        const visible = stripThinkingBlocks(accumulated);
        if (visible) {
          const preview = closeOpenMarkdown(visible) + " ▌";
          await ctx.api
            .editMessageText(chatId, placeholder.message_id, preview, { parse_mode: "Markdown" })
            .catch(async (err) => {
              logger.warn(err, "GPT stream: markdown preview failed, retrying as plain text");
              await ctx.api
                .editMessageText(chatId, placeholder.message_id, visible + " ▌")
                .catch((e) => logger.error(e, "GPT stream: plain text preview also failed"));
            });
          lastEdit = now;
        }
      }
    }

    const finalText = stripThinkingBlocks(accumulated);
    if (finalText) {
      await finalizeMessage(placeholder.message_id, finalText);
    } else {
      await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => void 0);
    }
  } catch (err: unknown) {
    logger.error(err, "GPT message error");
    await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      await ctx.reply(ctx.t.errors.noTool);
    }
  }
}

// ── New dialog ────────────────────────────────────────────────────────────────

export async function handleNewGptDialog(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;

  const state = await userStateService.get(ctx.user.id);
  const activeDialog = !!state?.gptDialogId && (await dialogService.findById(state.gptDialogId));
  const modelId = activeDialog ? activeDialog.modelId : DEFAULT_GPT_MODEL;

  const dialog = await dialogService.create({
    userId: ctx.user.id,
    section: "gpt",
    modelId,
  });

  await userStateService.setState(ctx.user.id, "GPT_ACTIVE", "gpt");
  await userStateService.setDialogForSection(ctx.user.id, "gpt", dialog.id);

  await ctx.reply(ctx.t.gpt.newDialogCreated);
}

// ── Incoming message in active GPT dialog ────────────────────────────────────

export async function handleGptMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;

  const state = await userStateService.get(ctx.user.id);
  if (!state?.gptDialogId) {
    await ctx.reply(ctx.t.gpt.newDialogCreated);
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await streamGptResponse(ctx, chatId, state.gptDialogId, ctx.message.text);
}

// ── Photo / document image in active GPT dialog ───────────────────────────────

export async function handleGptPhoto(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;

  const state = await userStateService.get(ctx.user.id);
  if (!state?.gptDialogId) {
    await ctx.reply(ctx.t.gpt.newDialogCreated);
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Resolve file ID — photo (compressed) or document (original file)
  let fileId: string;
  if (ctx.message?.photo) {
    fileId = ctx.message.photo.at(-1)!.file_id;
  } else if (ctx.message?.document?.mime_type?.startsWith("image/")) {
    fileId = ctx.message.document.file_id;
  } else {
    return;
  }

  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  const caption = ctx.message?.caption?.trim() ?? "";
  const mediaGroupId = ctx.message?.media_group_id;

  if (mediaGroupId) {
    // Buffer photos from the same album and process together after 800 ms silence
    const key = `${ctx.user.id}__${mediaGroupId}`;
    const existing = mediaGroupBuffer.get(key);

    if (existing) {
      clearTimeout(existing.timer);
      existing.urls.push(url);
      if (!existing.caption && caption) existing.caption = caption;
      existing.timer = setTimeout(() => {
        mediaGroupBuffer.delete(key);
        const prompt = existing.caption || existing.ctx.t.gpt.photoDefaultPrompt;
        void streamGptResponse(
          existing.ctx,
          existing.chatId,
          existing.dialogId,
          prompt,
          existing.urls,
        );
      }, 800);
    } else {
      const entry: MediaGroupEntry = {
        dialogId: state.gptDialogId,
        userId: ctx.user.id,
        chatId,
        urls: [url],
        caption,
        ctx,
        timer: setTimeout(() => {
          mediaGroupBuffer.delete(key);
          void streamGptResponse(ctx, chatId, state.gptDialogId!, caption, [url]);
        }, 800),
      };
      mediaGroupBuffer.set(key, entry);
    }
  } else {
    // Single photo — process immediately
    const prompt = caption || ctx.t.gpt.photoDefaultPrompt;
    await streamGptResponse(ctx, chatId, state.gptDialogId, prompt, [url]);
  }
}

// ── Management — opens Mini App ───────────────────────────────────────────────

export async function handleGptManagement(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const webappUrl = config.bot.webappUrl;
  if (!webappUrl) {
    await ctx.reply(ctx.t.errors.unexpected);
    return;
  }
  const kb = new InlineKeyboard().webApp(
    ctx.t.gpt.management,
    `${webappUrl}?page=management&section=gpt`,
  );
  await ctx.reply(ctx.t.gpt.management, { reply_markup: kb });
}

// ── Prompts (stub — full implementation pending) ──────────────────────────────

export async function handleGptPrompts(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await ctx.reply(ctx.t.gpt.prompts + ctx.t.common.comingSoon);
}
