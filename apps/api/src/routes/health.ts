import type { FastifyInstance } from "fastify";
import { getRedis } from "@rootmail/core";
import { betaInviteAutomationStatus, sql } from "@rootmail/db";
import { betaInviteRequired } from "../lib/beta";

/**
 * Can the beta invite actually be sent? Informational only — it is NOT part of
 * `healthy`: deploys gate on this endpoint, and a paused sequence must never
 * take the API down. Cached because the container healthcheck polls /health.
 */
const BETA_CHECK_TTL_MS = 60_000;
let betaCheck: { at: number; value: "ok" | "not_runnable" | "unknown" } | null = null;
async function betaInvites(): Promise<"ok" | "not_runnable" | "unknown"> {
  if (betaCheck && Date.now() - betaCheck.at < BETA_CHECK_TTL_MS) return betaCheck.value;
  let value: "ok" | "not_runnable" | "unknown";
  try {
    value = (await betaInviteAutomationStatus()).ok ? "ok" : "not_runnable";
  } catch {
    value = "unknown";
  }
  betaCheck = { at: Date.now(), value };
  return value;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async () => ({
    name: "rootmail",
    message: "Email infrastructure that scales with who's asking.",
    docs: "https://rootmail.io/docs",
  }));

  app.get("/health", async () => {
    const checks: Record<string, "ok" | "error"> = {};

    try {
      await sql`select 1`;
      checks.postgres = "ok";
    } catch {
      checks.postgres = "error";
    }

    try {
      await getRedis().ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    return {
      status: healthy ? "ok" : "degraded",
      service: "rootmail-api",
      checks,
      // One coarse word, public: whether a verified beta tester would get an
      // invite. Detail lives behind staff auth at /v1/admin/beta/automation.
      ...(betaInviteRequired() ? { beta_invites: await betaInvites() } : {}),
    };
  });
}
