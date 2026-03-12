import type { BotContext } from "../types/context.js";

/** Sent when the user writes a message but no tool/section is active. */
export async function handleNoTool(ctx: BotContext): Promise<void> {
  await ctx.reply(ctx.t.errors.noTool);
}
