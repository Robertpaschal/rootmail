import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/** Walk up from `start` looking for a `.env` file (monorepo root lives above cwd). */
function findEnvFile(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 64; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile(process.cwd());
if (envPath) {
  loadDotenv({ path: envPath });
}

/** Absolute path to the monorepo root (directory containing `.env`). */
export const rootDir = envPath ? dirname(envPath) : process.cwd();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1).default("postgres://rootmail:rootmail@localhost:5432/rootmail"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),

  // Shared secret the first-party dashboard uses to call internal endpoints
  // (e.g. social-login user upsert). Unset → those endpoints are disabled.
  INTERNAL_API_SECRET: z.string().optional(),

  ROOTMAIL_DOMAIN: z.string().default("rootmail.io"),
  DKIM_SELECTOR: z.string().default("rootmail"),

  DNS_VERIFY_MODE: z.enum(["mock", "live"]).default("mock"),
  MAIL_PROVIDER: z.enum(["mock", "sendgrid"]).default("mock"),
  MAILDIR: z.string().default(".maildir"),

  SENDGRID_API_KEY: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "Invalid environment configuration:\n",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
export type Env = typeof env;
