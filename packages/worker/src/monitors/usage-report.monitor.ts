import { Api } from "grammy";
import { config, AI_MODELS } from "@metabox/shared";
import { db } from "@metabox/api/db";
import { logger } from "../logger.js";

/** Returns milliseconds until the next 00:00 MSK (UTC+3). */
export function msUntilNextMidnightMsk(): number {
  const now = new Date();
  // Shift to MSK virtual clock
  const mskNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  // Next MSK midnight expressed in UTC
  const mskMidnight = new Date(
    Date.UTC(
      mskNow.getUTCFullYear(),
      mskNow.getUTCMonth(),
      mskNow.getUTCDate() + 1, // tomorrow
    ),
  );
  const nextMidnightUtc = new Date(mskMidnight.getTime() - 3 * 60 * 60 * 1000);
  return nextMidnightUtc.getTime() - now.getTime();
}

export async function sendUsageReport(): Promise<void> {
  const chatId = config.alerts.chatId;
  if (!chatId) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db.tokenTransaction.groupBy({
    by: ["modelId"],
    where: {
      reason: "ai_usage",
      modelId: { not: null },
      createdAt: { gte: since },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "asc" } }, // most negative first = most spent
  });

  if (rows.length === 0) {
    logger.info("Usage report: no ai_usage transactions in the last 24h");
    return;
  }

  // Date label in MSK
  const mskDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const dateLabel = mskDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const lines: string[] = [];
  let totalSpent = 0;

  for (const row of rows) {
    const modelId = row.modelId as string;
    const sum = Number(row._sum.amount ?? 0);
    const spent = Math.abs(sum);
    if (spent === 0) continue;
    const spentUsd = (spent / config.billing.targetMargin) * config.billing.usdPerToken;
    totalSpent += spent;
    const modelName = AI_MODELS[modelId]?.name ?? modelId;
    const spentStr = spent.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    const spentUsdStr = spentUsd.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    lines.push(`▪️ ${modelName}: *$${spentUsdStr} (${spentStr})*`);
  }

  if (lines.length === 0) return;

  const totalUsd = (totalSpent / config.billing.targetMargin) * config.billing.usdPerToken;
  const totalUsdStr = totalUsd.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const totalStr = totalSpent.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const text = [
    `📊 *Metabox — расход токенов за 24 ч* (${dateLabel})`,
    "",
    ...lines,
    "",
    `Итого списано: *$${totalUsdStr} (${totalStr})*`,
  ].join("\n");

  const telegram = new Api(config.bot.token);
  await telegram.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    message_thread_id: config.alerts.usageThreadId,
  });
  logger.info({ models: rows.length, totalSpent }, "Usage report sent");
}
