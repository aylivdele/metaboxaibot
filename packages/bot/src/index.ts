import "dotenv/config";
import { createBot } from "./bot.js";
import { preloadLocales, SUPPORTED_LANGUAGES } from "@metabox/shared";
import { logger } from "./logger.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is not set");

async function main() {
  logger.info("Loading i18n locales...");
  await preloadLocales(SUPPORTED_LANGUAGES);

  const bot = createBot(token!);

  logger.info("Starting bot (long polling)...");
  await bot.start({
    onStart: (info) => logger.info({ username: info.username }, "Bot started"),
  });
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
