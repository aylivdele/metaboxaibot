import "dotenv/config";
import { initSentry } from "./sentry.js";
initSentry(); // must be before any other imports that could throw
import { createBot } from "./bot.js";
import { preloadLocales, SUPPORTED_LANGUAGES, config } from "@metabox/shared";
import { logger } from "./logger.js";
import { run } from "@grammyjs/runner";

/**
 * Максимум времени, который мы ждём завершения in-flight handler'ов после
 * SIGTERM. Должен быть < `stop_grace_period` в docker-compose, чтобы мы
 * успели exit чисто до того как Docker пришлёт SIGKILL. LLM streaming на
 * thinking-моделях может тянуться до ~3 минут — берём 4 минуты с запасом.
 */
const SHUTDOWN_TIMEOUT_MS = 4 * 60 * 1000;

async function main() {
  logger.info("Loading i18n locales...");
  await preloadLocales(SUPPORTED_LANGUAGES);

  const bot = createBot(config.bot.token);

  // ── In-flight handler counter (graceful-shutdown insurance) ─────────────
  // grammy-runner сам ждёт завершения handler'ов в `runner.task()`, но для
  // прозрачности (логи + таймаут) считаем их явно через middleware.
  let inFlight = 0;
  bot.use(async (_ctx, next) => {
    inFlight++;
    try {
      await next();
    } finally {
      inFlight--;
    }
  });

  // Reset webhook and pending updates to ensure allowed_updates takes effect
  logger.info("Resetting webhook and pending updates...");
  await bot.api.deleteWebhook({ drop_pending_updates: true });

  // Set allowed_updates via a dummy getUpdates call before runner starts
  await bot.api.getUpdates({
    limit: 0,
    allowed_updates: [
      "message",
      "edited_message",
      "callback_query",
      "inline_query",
      "chosen_inline_result",
      "pre_checkout_query",
      "my_chat_member",
      "chat_member",
    ],
  });

  logger.info("Starting bot (long polling with runner)...");
  const runner = run(bot);

  let shuttingDown = false;
  const stopSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of stopSignals) {
    process.once(signal, () => {
      if (shuttingDown) {
        logger.warn({ signal }, "Second signal received, forcing exit");
        process.exit(1);
      }
      shuttingDown = true;
      logger.info({ signal, inFlight }, "Stopping bot runner — waiting for in-flight handlers...");
      runner.stop();

      // Hard-timeout: если handler'ы зависли (внешний API не отвечает),
      // exit'имся форс'ом до того как Docker пришлёт SIGKILL по grace period'у.
      const deadline = setTimeout(() => {
        logger.error({ inFlight }, "Shutdown timeout exceeded, forcing exit");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      // unref — таймер не должен мешать естественному exit'у когда handler'ы
      // успели завершиться раньше deadline.
      deadline.unref();

      // Прогресс-лог раз в 5 секунд пока есть in-flight.
      const progress = setInterval(() => {
        if (inFlight > 0) {
          logger.info({ inFlight }, "Still waiting for handlers to finish...");
        } else {
          clearInterval(progress);
        }
      }, 5000);
      progress.unref();
    });
  }

  await runner.task();
  logger.info({ inFlight }, "Bot runner stopped, exiting cleanly");
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
