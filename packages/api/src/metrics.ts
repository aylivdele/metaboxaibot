import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const aiRequestsTotal = new Counter({
  name: "ai_requests_total",
  help: "Total number of AI generation requests",
  labelNames: ["section", "model", "status"],
  registers: [registry],
});

export const tokenBalance = new Counter({
  name: "tokens_consumed_total",
  help: "Total tokens consumed by AI requests",
  labelNames: ["section", "model"],
  registers: [registry],
});
