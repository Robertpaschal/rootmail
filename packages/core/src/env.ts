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

  // --- Billing (Stripe) ----------------------------------------------------
  // Unset => "local" billing mode: plan changes write organizations.plan
  // directly (the pre-Stripe self-serve switch). Set the secret key to flip
  // into real "stripe" mode (Checkout + subscriptions + webhooks). Every price
  // below has a default-constant fallback in PLANS/ADD_ONS, so a missing or
  // slow-loading price never breaks the app.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_SCALE: z.string().optional(),
  STRIPE_PRICE_OVERAGE: z.string().optional(),
  STRIPE_PRICE_SEAT: z.string().optional(),
  STRIPE_PRICE_ADDON_DEDICATED_IP: z.string().optional(),
  STRIPE_PRICE_ADDON_SUBTENANT_PACK: z.string().optional(),
  // Where Checkout sends the user back (success/cancel). The dashboard's URL.
  DASHBOARD_URL: z.string().url().default("http://localhost:3001"),

  // --- AI template drafting ------------------------------------------------
  // Unset => a deterministic mock generator answers, so "Ask AI" is fully
  // demoable without a key. Set the key to use real Claude.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-4-8"),

  // --- Asset uploads (local dev driver; S3-ready interface) ----------------
  ASSET_STORAGE_DIR: z.string().default(".assets"),
  ASSET_PUBLIC_URL: z.string().url().default("http://localhost:4000/assets"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
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

/**
 * Billing mode is derived, not configured: the mere presence of a Stripe secret
 * flips the app from the local self-serve plan switch into real Stripe Checkout.
 */
export const BILLING_MODE: "stripe" | "local" = env.STRIPE_SECRET_KEY ? "stripe" : "local";
