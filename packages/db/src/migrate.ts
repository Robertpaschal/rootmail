import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@rootmail/core";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../migrations");

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  console.log(`Running migrations from ${migrationsFolder} …`);
  await migrate(db, { migrationsFolder });
  await client.end();
  console.log("✓ Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
