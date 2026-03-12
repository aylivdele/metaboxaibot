import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { logger } from "./logger.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profile.js";
import { dialogsRoutes } from "./routes/dialogs.js";
import { stateRoutes } from "./routes/state.js";
import { modelsRoutes } from "./routes/models.js";

const server = Fastify({ logger: false });

await server.register(cors, {
  origin: true, // allow all origins in dev; restrict in prod
});
await server.register(helmet);

// ── Routes ────────────────────────────────────────────────────────────────────
server.get("/health", async () => ({ status: "ok" }));
await server.register(authRoutes);
await server.register(profileRoutes);
await server.register(dialogsRoutes);
await server.register(stateRoutes);
await server.register(modelsRoutes);

const port = Number(process.env.API_PORT ?? 3001);
await server.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "API server started");
