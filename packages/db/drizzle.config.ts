import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs from packages/db, but .env lives at the repo root.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://rootmail:rootmail@localhost:5432/rootmail",
  },
  strict: true,
  verbose: true,
});
