import type { FastifyInstance } from "fastify";
import { getRedis } from "@rootmail/core";
import { sql } from "@rootmail/db";

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
    return { status: healthy ? "ok" : "degraded", service: "rootmail-api", checks };
  });
}
