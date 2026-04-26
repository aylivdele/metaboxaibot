/**
 * Runtime price overrides — in-memory cache + Redis pub/sub инвалидация.
 *
 * calculateCost дёргается на hot-path (каждое сообщение чата, каждый рендер
 * каталога). DB-hit на каждый вызов неприемлем; поэтому держим Map<scope+key, value>
 * в памяти и обновляем по pubsub-сигналу из админ-роутов.
 *
 * Lifecycle:
 *  - initPricingConfig() — вызывается до server.listen() и до старта BullMQ-воркеров.
 *  - disposePricingConfig() — для тестов / graceful shutdown.
 *
 * Sync API для calculateCost:
 *  - getModelMultiplier(modelId): 1.0 если нет override.
 *  - getEffectiveTargetMargin(): override либо config.billing.targetMargin.
 *
 * Cross-instance консистентность: при write-операциях admin-роуты вызывают
 * broadcastInvalidation(), который публикует в Redis-канал. Все API/worker
 * инстансы получают сообщение и перезагружают кеш. Safety-net таймер
 * (5 минут) подстраховывает от потерянных pubsub-сообщений.
 */

import { Redis } from "ioredis";
import { config } from "@metabox/shared";
import { db } from "../db.js";
import { getRedis } from "../redis.js";
import { logger } from "../logger.js";

const PUBSUB_CHANNEL = "pricing-config:invalidate";
const SAFETY_NET_MS = 5 * 60 * 1000;

interface OverrideEntry {
  multiplier: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

const modelMultipliers = new Map<string, OverrideEntry>();
let globalOverride: OverrideEntry | null = null;

let subscriber: Redis | null = null;
let safetyTimer: NodeJS.Timeout | null = null;
let initialized = false;

async function loadFromDb(): Promise<void> {
  const rows = await db.pricingOverride.findMany();
  modelMultipliers.clear();
  globalOverride = null;
  for (const row of rows) {
    const entry: OverrideEntry = {
      multiplier: Number(row.multiplier),
      note: row.note,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.scope === "model") {
      modelMultipliers.set(row.key, entry);
    } else if (row.scope === "global" && row.key === "targetMargin") {
      globalOverride = entry;
    }
  }
  logger.info(
    { models: modelMultipliers.size, hasGlobal: !!globalOverride },
    "pricing-config: cache reloaded",
  );
}

export async function initPricingConfig(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await loadFromDb();

  // Отдельный Redis-клиент: subscriber'ы не могут issue commands на той же
  // connection. duplicate() копирует конфиг исходного клиента.
  subscriber = getRedis().duplicate();
  subscriber.on("message", (channel) => {
    if (channel !== PUBSUB_CHANNEL) return;
    void loadFromDb().catch((err) =>
      logger.error({ err }, "pricing-config: pubsub-driven reload failed"),
    );
  });
  subscriber.on("error", (err) => {
    logger.warn({ err }, "pricing-config: subscriber error");
  });
  await subscriber.subscribe(PUBSUB_CHANNEL);

  // Подстраховка: на случай потерянного pubsub-сообщения (Redis-restart, network blip)
  // пересинхронизируем кэш каждые 5 минут.
  safetyTimer = setInterval(() => {
    void loadFromDb().catch((err) =>
      logger.error({ err }, "pricing-config: safety-net reload failed"),
    );
  }, SAFETY_NET_MS);
  // Не блокируем event-loop при graceful shutdown.
  if (typeof safetyTimer.unref === "function") safetyTimer.unref();

  logger.info("pricing-config: initialized");
}

export async function disposePricingConfig(): Promise<void> {
  if (safetyTimer) {
    clearInterval(safetyTimer);
    safetyTimer = null;
  }
  if (subscriber) {
    try {
      await subscriber.unsubscribe(PUBSUB_CHANNEL);
    } catch {
      // ignore
    }
    subscriber.disconnect();
    subscriber = null;
  }
  modelMultipliers.clear();
  globalOverride = null;
  initialized = false;
}

/** Sync. Default 1.0 если нет override. */
export function getModelMultiplier(modelId: string): number {
  return modelMultipliers.get(modelId)?.multiplier ?? 1.0;
}

/** Sync. Default — config.billing.targetMargin. */
export function getEffectiveTargetMargin(): number {
  return globalOverride?.multiplier ?? config.billing.targetMargin;
}

/** Снимок состояния для admin GET-эндпоинта. */
export function getAllOverrides(): {
  models: Record<string, OverrideEntry>;
  global: OverrideEntry | null;
} {
  const models: Record<string, OverrideEntry> = {};
  for (const [key, entry] of modelMultipliers) models[key] = entry;
  return { models, global: globalOverride };
}

/**
 * Публикует invalidation-событие. Вызывается админ-роутами после write-операции.
 * Также сразу перезагружает локальный кэш — иначе на этом инстансе изменения
 * увидим только после того, как pubsub долетит обратно (~ms, но лишний race).
 */
export async function broadcastInvalidation(): Promise<void> {
  await loadFromDb();
  try {
    await getRedis().publish(PUBSUB_CHANNEL, "1");
  } catch (err) {
    logger.warn({ err }, "pricing-config: broadcast publish failed");
  }
}
