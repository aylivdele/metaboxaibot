import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { logger } from "./logger.js";

const server = Fastify({ logger: false });

await server.register(cors);
await server.register(helmet);

server.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.API_PORT ?? 3001);
await server.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "API server started");
