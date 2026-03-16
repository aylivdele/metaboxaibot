import type { BotContext } from "../types/context.js";
import { dialogService, generationService, userStateService } from "@metabox/api/services";
import { MODELS_BY_SECTION, config } from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { logger } from "../logger.js";

// ── Model selection keyboard ──────────────────────────────────────────────────

export function buildDesignModelKeyboard(): InlineKeyboard {
  const models = MODELS_BY_SECTION["design"] ?? [];
  const kb = new InlineKeyboard();
  for (let i = 0; i < models.length; i += 2) {
    kb.text(models[i].name, `design_model_${models[i].id}`);
    if (models[i + 1]) kb.text(models[i + 1].name, `design_model_${models[i + 1].id}`);
    kb.row();
  }
  return kb;
}

// ── Model selected via inline callback ───────────────────────────────────────

export async function handleDesignModelSelect(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const modelId = ctx.callbackQuery?.data?.replace("design_model_", "") ?? "";

  await ctx.answerCallbackQuery();
  await userStateService.setState(ctx.user.id, "DESIGN_ACTIVE", "design");
  await userStateService.setModel(ctx.user.id, modelId);

  await ctx.reply(ctx.t.design.modelActivated);
}

// ── Incoming prompt in DESIGN_ACTIVE state ────────────────────────────────────

export async function handleDesignMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = await userStateService.get(ctx.user.id);
  const activeDialog =
    !!state?.designDialogId && (await dialogService.findById(state.designDialogId));
  const modelId = activeDialog ? activeDialog.modelId : "dall-e-3";
  const prompt = ctx.message.text;

  const pendingMsg = await ctx.reply(ctx.t.design.generating);

  try {
    const result = await generationService.submitImage({
      userId: ctx.user.id,
      modelId,
      prompt,
      telegramChatId: chatId,
    });

    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);

    if (!result.isPending && result.imageUrl) {
      // Sync result (DALL-E 3) — send immediately
      await ctx.replyWithPhoto(result.imageUrl, { caption: `🎨 ${prompt.slice(0, 200)}` });
    } else {
      // Async — worker will notify when done
      await ctx.reply(ctx.t.design.asyncPending);
    }
  } catch (err: unknown) {
    await ctx.api.deleteMessage(chatId, pendingMsg.message_id).catch(() => void 0);
    if (err instanceof Error && err.message === "INSUFFICIENT_TOKENS") {
      await ctx.reply(ctx.t.errors.insufficientTokens);
    } else {
      logger.error(err, "Design message error");
      await ctx.reply(ctx.t.design.generationFailed);
    }
  }
}

// ── Management — opens Mini App ───────────────────────────────────────────────

export async function handleDesignManagement(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const webappUrl = config.bot.webappUrl;
  if (!webappUrl) {
    await ctx.reply(ctx.t.errors.unexpected);
    return;
  }
  const kb = new InlineKeyboard().webApp(ctx.t.design.management, `${webappUrl}#management/design`);
  await ctx.reply(ctx.t.design.management, { reply_markup: kb });
}

// ── New design dialog ─────────────────────────────────────────────────────────

export async function handleNewDesignDialog(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  await userStateService.setState(ctx.user.id, "DESIGN_SECTION", "design");
  await ctx.reply(ctx.t.design.sectionTitle, {
    reply_markup: buildDesignModelKeyboard(),
  });
}
