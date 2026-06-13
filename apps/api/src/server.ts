import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "@rootmail/core";
import "./context";
import { registerAuth } from "./plugins/auth";
import { registerErrorHandler } from "./plugins/errors";
import { apiKeyRoutes } from "./routes/apikeys";
import { authRoutes } from "./routes/auth";
import { contactRoutes } from "./routes/contacts";
import { healthRoutes } from "./routes/health";
import { messageRoutes } from "./routes/messages";
import { subTenantRoutes } from "./routes/subtenants";
import { templateRoutes } from "./routes/templates";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(sensible);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Key by API key when present, else by IP. (In-memory store for local dev.)
    keyGenerator: (req) => req.headers.authorization ?? req.ip,
    allowList: (req) => req.url === "/" || req.url.startsWith("/health"),
  });

  registerErrorHandler(app);
  registerAuth(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(messageRoutes);
  await app.register(subTenantRoutes);
  await app.register(contactRoutes);
  await app.register(apiKeyRoutes);
  await app.register(templateRoutes);

  return app;
}
