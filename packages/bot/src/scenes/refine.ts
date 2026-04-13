/**
 * Refine flow — "Доработать" button under generated images.
 *
 * Allows the user to load a generated image into a media input slot
 * of the active model, or choose a different model/section.
 *
 * Callback data formats (jobId = GenerationJob cuid, ~25 chars):
 *   design_ref_{jobId}          — entry point
 *   ref_use:{jobId}             — use in active model
 *   ref_choose:{jobId}          — show section chooser
 *   ref_sec:{d|v}:{jobId}       — show models for section
 *   ref_mdl:{modelId}:{jobId}   — activate model
 *   ref_slt:{slotKey}:{jobId}   — pick slot (when model has multiple)
 */
import type { BotContext } from "../types/context.js";
import { generationService, userStateService } from "@metabox/api/services";
import {
  AI_MODELS,
  MODELS_BY_SECTION,
  resolveModelDisplay,
  type MediaInputSlot,
} from "@metabox/shared";
import { InlineKeyboard } from "grammy";
import { activateVideoModel, sendVideoMediaInputStatus } from "./video.js";
import { activateDesignModel, sendDesignMediaInputStatus } from "./design.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Modes that accept a generated image for refinement, per section. */
const DESIGN_REFINE_MODES = new Set(["edit", "style_reference"]);
const VIDEO_REFINE_MODES = new Set(["first_frame", "last_frame", "reference"]);

function getCompatibleSlots(
  slots: MediaInputSlot[] | undefined,
  section: "design" | "video",
): MediaInputSlot[] {
  if (!slots?.length) return [];
  const modes = section === "design" ? DESIGN_REFINE_MODES : VIDEO_REFINE_MODES;
  return slots.filter((s) => modes.has(s.mode));
}

/** Build a model-list keyboard for models in `section` that have compatible slots. */
function buildRefineModelKeyboard(
  section: "design" | "video",
  jobId: string,
  lang: string,
): InlineKeyboard {
  const allModels = MODELS_BY_SECTION[section] ?? [];
  const kb = new InlineKeyboard();
  const seen = new Set<string>();
  for (const model of allModels) {
    if (seen.has(model.id)) continue;
    const compatible = getCompatibleSlots(model.mediaInputs, section);
    if (compatible.length === 0) continue;
    seen.add(model.id);
    const { name } = resolveModelDisplay(model.id, lang, model);
    kb.text(name, `ref_mdl:${model.id}:${jobId}`).row();
  }
  return kb;
}

/** Save s3Key into a media input slot and send the updated status menu. */
async function fillSlotAndSendStatus(
  ctx: BotContext,
  slotKey: string,
  s3Key: string,
  section: "design" | "video",
): Promise<void> {
  if (!ctx.user) return;
  await userStateService.addMediaInput(ctx.user.id, slotKey, s3Key);
  if (section === "video") {
    await sendVideoMediaInputStatus(ctx);
  } else {
    await sendDesignMediaInputStatus(ctx);
  }
}

/** Show "choose which slot" inline buttons for a model with multiple compatible slots. */
async function showSlotChoice(
  ctx: BotContext,
  compatibleSlots: MediaInputSlot[],
  jobId: string,
): Promise<void> {
  const kb = new InlineKeyboard();
  for (const slot of compatibleSlots) {
    const label = ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
    kb.text(label, `ref_slt:${slot.slotKey}:${jobId}`).row();
  }
  await ctx.editMessageText(ctx.t.mediaInput.refineChooseSlot, { reply_markup: kb });
}

// ── Entry point: design_ref_{jobId} ─────────────────────────────────────────

export async function handleRefineEntry(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const jobId = (ctx.callbackQuery?.data ?? "").replace("design_ref_", "");
  await ctx.answerCallbackQuery();

  // Fetch job to verify it exists and has s3Key
  const job = await generationService.getJobById(jobId);
  if (!job?.s3Key) return;

  const state = await userStateService.get(ctx.user.id);
  const section = (state?.section ?? "design") as "design" | "video" | "gpt" | "audio";

  // Determine active model and check for compatible slots
  let activeModelId: string | null = null;
  let compatibleSlots: MediaInputSlot[] = [];

  if (section === "video") {
    activeModelId = state?.videoModelId ?? null;
    if (activeModelId) {
      const model = AI_MODELS[activeModelId];
      compatibleSlots = getCompatibleSlots(model?.mediaInputs, "video");
    }
  } else if (section === "design") {
    activeModelId = state?.designModelId ?? null;
    if (activeModelId) {
      const model = AI_MODELS[activeModelId];
      compatibleSlots = getCompatibleSlots(model?.mediaInputs, "design");
    }
  }

  if (activeModelId && compatibleSlots.length > 0) {
    // Step 2a: active model supports — ask user
    const model = AI_MODELS[activeModelId]!;
    const { name: modelName } = resolveModelDisplay(
      activeModelId,
      ctx.user.language ?? "en",
      model,
    );
    const text = ctx.t.mediaInput.refineUseActive.replace("{model}", modelName);
    const kb = new InlineKeyboard()
      .text(ctx.t.mediaInput.refineActiveLabel.replace("{model}", modelName), `ref_use:${jobId}`)
      .row()
      .text(ctx.t.mediaInput.refineChooseModel, `ref_choose:${jobId}`);
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
    await ctx.reply(text, { reply_markup: kb });
  } else {
    // Step 2b: active model doesn't support
    const kb = new InlineKeyboard()
      .text(ctx.t.mediaInput.refineDesign, `ref_sec:d:${jobId}`)
      .text(ctx.t.mediaInput.refineVideo, `ref_sec:v:${jobId}`);
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);
    await ctx.reply(ctx.t.mediaInput.refineNoSupport, { reply_markup: kb });
  }
}

// ── ref_use:{jobId} — use in active model ────────────────────────────────────

export async function handleRefineUseActive(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const jobId = (ctx.callbackQuery?.data ?? "").replace("ref_use:", "");
  await ctx.answerCallbackQuery();

  const job = await generationService.getJobById(jobId);
  if (!job?.s3Key) return;

  const state = await userStateService.get(ctx.user.id);
  const section = (state?.section ?? "design") as "design" | "video";
  const activeModelId =
    section === "video" ? (state?.videoModelId ?? null) : (state?.designModelId ?? null);
  if (!activeModelId) return;

  const model = AI_MODELS[activeModelId];
  const compatibleSlots = getCompatibleSlots(model?.mediaInputs, section);

  if (compatibleSlots.length === 1) {
    // Single slot — fill directly
    await fillSlotAndSendStatus(ctx, compatibleSlots[0].slotKey, job.s3Key, section);
  } else if (compatibleSlots.length > 1) {
    // Multiple slots — ask which one
    await showSlotChoice(ctx, compatibleSlots, jobId);
  }
}

// ── ref_choose:{jobId} — show section buttons ───────────────────────────────

export async function handleRefineChooseModel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const jobId = (ctx.callbackQuery?.data ?? "").replace("ref_choose:", "");
  await ctx.answerCallbackQuery();

  const kb = new InlineKeyboard()
    .text(ctx.t.mediaInput.refineDesign, `ref_sec:d:${jobId}`)
    .text(ctx.t.mediaInput.refineVideo, `ref_sec:v:${jobId}`);
  await ctx.editMessageText(ctx.t.mediaInput.refineNoSupport, { reply_markup: kb });
}

// ── ref_sec:{d|v}:{jobId} — show models for section ────────────────────────

export async function handleRefineSection(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = (ctx.callbackQuery?.data ?? "").replace("ref_sec:", "");
  const sectionCode = data[0]; // "d" or "v"
  const jobId = data.slice(2);
  await ctx.answerCallbackQuery();

  const section: "design" | "video" = sectionCode === "v" ? "video" : "design";
  const lang = ctx.user.language ?? "en";
  const kb = buildRefineModelKeyboard(section, jobId, lang);

  if (!kb.inline_keyboard.length) {
    // No models with compatible slots — shouldn't happen, but handle gracefully
    await ctx.editMessageText(ctx.t.mediaInput.refineNoSupport);
    return;
  }
  await ctx.editMessageText(ctx.t.mediaInput.refineChooseModel, { reply_markup: kb });
}

// ── ref_mdl:{modelId}:{jobId} — activate model ─────────────────────────────

export async function handleRefineModel(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = (ctx.callbackQuery?.data ?? "").replace("ref_mdl:", "");
  // modelId may contain colons? No — model IDs are alphanumeric+hyphens.
  // Format: {modelId}:{jobId}
  const sepIdx = data.lastIndexOf(":");
  const modelId = data.slice(0, sepIdx);
  const jobId = data.slice(sepIdx + 1);
  await ctx.answerCallbackQuery();

  const job = await generationService.getJobById(jobId);
  if (!job?.s3Key) return;

  const model = AI_MODELS[modelId];
  if (!model) return;

  const section = model.section as "design" | "video";
  const compatibleSlots = getCompatibleSlots(model.mediaInputs, section);
  if (compatibleSlots.length === 0) return;

  // Remove the inline keyboard from the chooser message
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);

  // Activate the model (sends activation message with hints)
  if (section === "video") {
    await activateVideoModel(ctx, modelId);
  } else {
    await activateDesignModel(ctx, modelId);
  }

  // Fill the slot
  if (compatibleSlots.length === 1) {
    await userStateService.addMediaInput(ctx.user.id, compatibleSlots[0].slotKey, job.s3Key);
    if (section === "video") {
      await sendVideoMediaInputStatus(ctx);
    } else {
      await sendDesignMediaInputStatus(ctx);
    }
  } else {
    // Multiple compatible slots — ask which one
    const kb = new InlineKeyboard();
    for (const slot of compatibleSlots) {
      const label =
        ctx.t.mediaInput[slot.labelKey as keyof typeof ctx.t.mediaInput] ?? slot.labelKey;
      kb.text(label, `ref_slt:${slot.slotKey}:${jobId}`).row();
    }
    await ctx.reply(ctx.t.mediaInput.refineChooseSlot, { reply_markup: kb });
  }
}

// ── ref_slt:{slotKey}:{jobId} — pick slot ───────────────────────────────────

export async function handleRefineSlot(ctx: BotContext): Promise<void> {
  if (!ctx.user) return;
  const data = (ctx.callbackQuery?.data ?? "").replace("ref_slt:", "");
  const sepIdx = data.lastIndexOf(":");
  const slotKey = data.slice(0, sepIdx);
  const jobId = data.slice(sepIdx + 1);
  await ctx.answerCallbackQuery();

  const job = await generationService.getJobById(jobId);
  if (!job?.s3Key) return;

  const state = await userStateService.get(ctx.user.id);
  const section = (state?.section ?? "design") as "design" | "video";

  // Remove the slot chooser keyboard
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => void 0);

  await fillSlotAndSendStatus(ctx, slotKey, job.s3Key, section);
}
