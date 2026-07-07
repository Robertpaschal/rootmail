import { env } from "@rootmail/core";
import { closeDb } from "@rootmail/db";
import { refreshPlanCache } from "./lib/plans";
import { refreshTierCache } from "./lib/wings";
import { buildServer } from "./server";

async function main() {
  await Promise.all([refreshPlanCache(), refreshTierCache()]); // warm the DB-backed pricing caches before serving
  const app = await buildServer();
  await app.listen({ port: env.API_PORT, host: env.API_HOST });

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`);
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
