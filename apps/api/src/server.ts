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
import { assistantRoutes } from "./routes/assistant";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { analyticsRoutes } from "./routes/analytics";
import { announcementRoutes } from "./routes/announcements";
import { campaignRoutes } from "./routes/campaigns";
import { contactRoutes } from "./routes/contacts";
import { deliverabilityRoutes } from "./routes/deliverability";
import { exportRoutes } from "./routes/exports";
import { importRoutes } from "./routes/imports";
import { listRoutes } from "./routes/lists";
import { healthRoutes } from "./routes/health";
import { leadRoutes } from "./routes/leads";
import { memberRoutes } from "./routes/members";
import { messageRoutes } from "./routes/messages";
import { adminRoutes } from "./routes/admin";
import { organizationRoutes } from "./routes/organization";
import { proofRoutes } from "./routes/proof";
import { retentionRoutes } from "./routes/retention";
import { roleRoutes } from "./routes/roles";
import { sequenceRoutes } from "./routes/sequences";
import { subTenantRoutes } from "./routes/subtenants";
import { templateRoutes } from "./routes/templates";
import { templateAiRoutes } from "./routes/templates-ai";
import { threadRoutes } from "./routes/threads";
import { webhookRoutes } from "./routes/webhooks";
import { sesWebhookRoutes } from "./routes/webhooks-ses";
import { stripeWebhookRoutes } from "./routes/webhooks-stripe";
import { workspaceRoutes } from "./routes/workspaces";

/** Fastify's trustProxy accepts a boolean, a hop count, or an IP/CIDR allowlist. */
function parseTrustProxy(v: string): boolean | number | string {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 0) return n;
  return v; // comma-separated IP/CIDR allowlist, passed through to Fastify
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    // Bounded by default (trust one proxy hop) so a spoofed X-Forwarded-For can't
    // be used to evade per-IP rate limits; override via TRUST_PROXY per topology.
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
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
  await app.register(deliverabilityRoutes);
  await app.register(analyticsRoutes);
  await app.register(announcementRoutes);
  await app.register(exportRoutes);
  await app.register(importRoutes);
  await app.register(threadRoutes);
  await app.register(billingRoutes);
  await app.register(organizationRoutes);
  await app.register(workspaceRoutes);
  await app.register(memberRoutes);
  await app.register(roleRoutes);
  await app.register(webhookRoutes);
  await app.register(stripeWebhookRoutes);
  await app.register(sesWebhookRoutes);
  await app.register(assetRoutes);
  await app.register(proofRoutes);
  await app.register(retentionRoutes);
  await app.register(assistantRoutes);
  await app.register(leadRoutes);
  await app.register(adminRoutes);

  return app;
}
