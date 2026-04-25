import pino from "pino";
import { config } from "@metabox/shared";

export const logger = pino({
  level: config.log.level ?? "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
