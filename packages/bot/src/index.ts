import "dotenv/config";
import { initSentry } from "./sentry.js";
initSentry(); // must be before any other imports that could throw
import { createBot } from "./bot.js";
import { preloadLocales, SUPPORTED_LANGUAGES, config } from "@metabox/shared";
import { logger } from "./logger.js";
import { run } from "@grammyjs/runner";

async function main() {
  logger.info("Loading i18n locales...");
  await preloadLocales(SUPPORTED_LANGUAGES);

  const bot = createBot(config.bot.token);

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

  const stopSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of stopSignals) {
    process.once(signal, () => {
      logger.info({ signal }, "Stopping bot runner...");
      runner.stop();
    });
  }

  await runner.task();
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
