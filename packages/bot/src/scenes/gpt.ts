import type { BotContext } from "../types/context.js";
import { chatService, dialogService, userStateService } from "@metabox/api/services";
import { logger } from "../logger.js";
import { config } from "@metabox/shared";
import { InlineKeyboard } from "grammy";

/** Default model for new GPT dialogs (user can change via Management). */
const DEFAULT_GPT_MODEL = "gpt-4o";
/** Minimum ms between Telegram message edits (rate-limit safety). */
const EDIT_THROTTLE_MS = 1200;

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
    // No active dialog — prompt user to create one
    await ctx.reply(ctx.t.gpt.newDialogCreated);
    return;
  }

  const userText = ctx.message.text;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Send placeholder message to edit progressively
  const placeholder = await ctx.reply("⏳");
  let accumulated = "";
  let lastEdit = Date.now();

  try {
    const stream = chatService.sendMessageStream({
      dialogId: state.gptDialogId,
      userId: ctx.user.id,
      content: userText,
    });

    for await (const chunk of stream) {
      accumulated += chunk;
      const now = Date.now();
      if (now - lastEdit >= EDIT_THROTTLE_MS && accumulated.trim()) {
        await ctx.api
          .editMessageText(chatId, placeholder.message_id, accumulated + " ▌")
          .catch(() => void 0);
        lastEdit = now;
      }
    }

    // Final edit — remove cursor
    if (accumulated.trim()) {
      await ctx.api
        .editMessageText(chatId, placeholder.message_id, accumulated)
        .catch(() => void 0);
    } else {
      await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => void 0);
    }
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      logger.error(err, "GPT message error");
      await ctx.reply(ctx.t.errors.noTool);
    }
  }
}

// ── GPT Editor activation ─────────────────────────────────────────────────────

export async function handleActivateGptEditor(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "GPT_ACTIVE", "gpt");
  await ctx.reply(ctx.t.gpt.gptEditorActivated);
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
