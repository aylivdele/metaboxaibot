import "dotenv/config";
import { initSentry } from "./sentry.js";
initSentry(); // must be before any other imports that could throw
import { createBot } from "./bot.js";
import { preloadLocales, SUPPORTED_LANGUAGES, config } from "@metabox/shared";
import { logger } from "./logger.js";

async function main() {
  logger.info("Loading i18n locales...");
  await preloadLocales(SUPPORTED_LANGUAGES);

  const bot = createBot(config.bot.token);

  logger.info("Starting bot (long polling)...");
  await bot.start({
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
    onStart: (info) => logger.info({ username: info.username }, "Bot started"),
  });
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
