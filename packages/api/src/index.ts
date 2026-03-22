import "dotenv/config";
import { initSentry } from "./sentry.js";
initSentry();

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";
import { registry } from "./metrics.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profile.js";
import { dialogsRoutes } from "./routes/dialogs.js";
import { stateRoutes } from "./routes/state.js";
import { modelsRoutes } from "./routes/models.js";
import { adminRoutes } from "./routes/admin.js";
import { paymentsRoutes } from "./routes/payments.js";
import { galleryRoutes } from "./routes/gallery.js";
import { slidesRoutes } from "./routes/slides.js";
import { imageSettingsRoutes } from "./routes/image-settings.js";
import { videoSettingsRoutes } from "./routes/video-settings.js";
import { internalRoutes } from "./routes/internal.js";
import { metaboxAibotRoutes } from "./routes/metabox-aibot.js";
import { config } from "@metabox/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = Fastify({ logger: false });

await server.register(cors, {
  origin: true, // restrict in prod via env
});
await server.register(helmet);

await server.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({ error: "Too Many Requests" }),
});

await server.register(swagger, {
  openapi: {
    info: {
      title: "Metabox AI Bot API",
      version: "1.0.0",
      description: "Internal API for Metabox Telegram Mini App",
    },
    components: {
      securitySchemes: {
        telegramAuth: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "Telegram Mini App auth: `tma <initDataRaw>`",
        },
      },
    },
  },
});
await server.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: { docExpansion: "list" },
});

await server.register(fastifyMultipart, {
  limits: { fileSize: 5 * 1024 * 1024 },
});
await server.register(fastifyStatic, {
  root: join(__dirname, "..", "uploads"),
  prefix: "/uploads/",
  decorateReply: false,
});

// ── Routes ────────────────────────────────────────────────────────────────────
server.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));

server.get("/metrics", { schema: { hide: true } }, async (_request, reply) => {
  const metrics = await registry.metrics();
  await reply.type(registry.contentType).send(metrics);
});

await server.register(authRoutes);
await server.register(profileRoutes);
await server.register(dialogsRoutes);
await server.register(stateRoutes);
await server.register(modelsRoutes);
await server.register(adminRoutes);
await server.register(paymentsRoutes);
await server.register(galleryRoutes);
await server.register(slidesRoutes);
await server.register(imageSettingsRoutes);
await server.register(videoSettingsRoutes);
await server.register(internalRoutes, { prefix: "/internal" });
await server.register(metaboxAibotRoutes);

const port = config.api.port;
await server.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "API server started");
