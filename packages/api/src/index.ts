import "dotenv/config";
import { initSentry } from "./sentry.js";
initSentry();

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { logger } from "./logger.js";
import { registry } from "./metrics.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profile.js";
import { dialogsRoutes } from "./routes/dialogs.js";
import { stateRoutes } from "./routes/state.js";
import { modelsRoutes } from "./routes/models.js";
import { adminRoutes } from "./routes/admin.js";

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

const port = Number(process.env.API_PORT ?? 3001);
await server.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "API server started");
