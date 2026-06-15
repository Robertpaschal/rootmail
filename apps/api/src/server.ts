import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "@rootmail/core";
import "./context";
import { registerAuth } from "./plugins/auth";
import { registerErrorHandler } from "./plugins/errors";
import { apiKeyRoutes } from "./routes/apikeys";
import { assetRoutes } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { campaignRoutes } from "./routes/campaigns";
import { contactRoutes } from "./routes/contacts";
import { listRoutes } from "./routes/lists";
import { healthRoutes } from "./routes/health";
import { memberRoutes } from "./routes/members";
import { messageRoutes } from "./routes/messages";
import { sequenceRoutes } from "./routes/sequences";
import { subTenantRoutes } from "./routes/subtenants";
import { templateRoutes } from "./routes/templates";
import { templateAiRoutes } from "./routes/templates-ai";
import { threadRoutes } from "./routes/threads";
import { webhookRoutes } from "./routes/webhooks";
import { stripeWebhookRoutes } from "./routes/webhooks-stripe";

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
  await app.register(multipart, {
    limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
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
  await app.register(templateAiRoutes);
  await app.register(sequenceRoutes);
  await app.register(listRoutes);
  await app.register(campaignRoutes);
  await app.register(threadRoutes);
  await app.register(billingRoutes);
  await app.register(memberRoutes);
  await app.register(webhookRoutes);
  await app.register(stripeWebhookRoutes);
  await app.register(assetRoutes);

  return app;
}
