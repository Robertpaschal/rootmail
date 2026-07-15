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
  // How many reverse-proxy hops to trust when deriving the client IP (used for
  // rate limiting, login throttling, and audit). `true` trusts a client-supplied
  // X-Forwarded-For — which is spoofable, letting an attacker dodge per-IP limits
  // — so DON'T use it in prod. Default `1` (single LB/CDN in front); set to the
  // real hop count, or an IP/CIDR allowlist, for your topology. `false` = use the
  // socket address directly (no proxy).
  TRUST_PROXY: z.string().default("1"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),

  // Shared secret the first-party dashboard uses to call internal endpoints
  // (e.g. social-login user upsert). Unset → those endpoints are disabled.
  INTERNAL_API_SECRET: z.string().optional(),

  // Secret for signing tamper-proof public links (unsubscribe). Unset → a
  // dev-insecure default is used; set a strong value in production.
  LINK_SIGNING_SECRET: z.string().optional(),

  // Ed25519 private key (PKCS8 PEM) for signing Layer-3 proof bundles. Unset →
  // a stable dev key in source (dev-only). Generate prod:
  //   openssl genpkey -algorithm ed25519
  PROOF_SIGNING_KEY: z.string().optional(),

  // Dev-only escape hatch: allow outbound webhooks to loopback/private hosts so
  // a local catcher can be tested. NEVER enable in production (SSRF risk).
  WEBHOOK_ALLOW_LOCAL: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  ROOTMAIL_DOMAIN: z.string().default("rootmail.io"),
  DKIM_SELECTOR: z.string().default("rootmail"),

  DNS_VERIFY_MODE: z.enum(["mock", "live"]).default("mock"),
  MAIL_PROVIDER: z.enum(["mock", "ses", "sendgrid"]).default("mock"),
  MAILDIR: z.string().default(".maildir"),

  // Subdomain whose MX points at SES inbound, for reply capture. Outbound thread
  // sends set Reply-To to reply+<threadId>@<INBOUND_DOMAIN>; the SES inbound
  // webhook parses the thread id back out. Unset → reply capture is off.
  INBOUND_DOMAIN: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),

  // --- Billing (Stripe) ----------------------------------------------------
  // Unset => "local" billing mode: plan changes write organizations.plan
  // directly (the pre-Stripe self-serve switch). Set the secret key to flip
  // into real "stripe" mode (Checkout + subscriptions + webhooks). Every price
  // below has a default-constant fallback in PLANS/ADD_ONS, so a missing or
  // slow-loading price never breaks the app.
  STRIPE_SECRET_KEY: z.string().optional(),
  // Publishable key (pk_…) — safe to expose to the browser. Needed for on-page
  // (embedded) checkout; without it the dashboard falls back to the hosted redirect.
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_SCALE: z.string().optional(),
  STRIPE_PRICE_PRO_YEAR: z.string().optional(),
  STRIPE_PRICE_SCALE_YEAR: z.string().optional(),
  // Metered overage prices — per plan, since the per-1,000 rate differs by tier.
  // These must be usage-based prices backed by a Billing Meter; the meter's
  // event_name goes in STRIPE_METER_OVERAGE_* below (used to report usage).
  STRIPE_PRICE_OVERAGE_PRO: z.string().optional(),
  STRIPE_PRICE_OVERAGE_SCALE: z.string().optional(),
  STRIPE_METER_OVERAGE_PRO: z.string().optional(),
  STRIPE_METER_OVERAGE_SCALE: z.string().optional(),
  STRIPE_PRICE_SEAT: z.string().optional(),
  STRIPE_PRICE_ADDON_DEDICATED_IP: z.string().optional(),
  STRIPE_PRICE_ADDON_SUBTENANT_PACK: z.string().optional(),
  STRIPE_PRICE_ADDON_WORKSPACE_PACK: z.string().optional(),
  STRIPE_PRICE_ADDON_AI_CREDITS: z.string().optional(),
  // Yearly add-on prices (same key + _YEAR). Add-ons can be bought on a yearly sub.
  STRIPE_PRICE_SEAT_YEAR: z.string().optional(),
  STRIPE_PRICE_ADDON_DEDICATED_IP_YEAR: z.string().optional(),
  STRIPE_PRICE_ADDON_SUBTENANT_PACK_YEAR: z.string().optional(),
  STRIPE_PRICE_ADDON_WORKSPACE_PACK_YEAR: z.string().optional(),
  STRIPE_PRICE_ADDON_AI_CREDITS_YEAR: z.string().optional(),
  // Where Checkout sends the user back (success/cancel). The dashboard's URL.
  DASHBOARD_URL: z.string().url().default("http://localhost:3001"),
  // The marketing site's base URL — used to trigger on-publish ISR revalidation
  // when staff edit CMS content. The shared secret is INTERNAL_API_SECRET.
  MARKETING_URL: z.string().url().default("http://localhost:3000"),

  // --- AI template drafting ------------------------------------------------
  // Unset => a deterministic mock generator answers, so "Ask AI" is fully
  // demoable without a key. Set the key to use real Claude.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-4-8"),

  // --- Asset uploads -------------------------------------------------------
  // Default driver writes to ASSET_STORAGE_DIR and serves at ASSET_PUBLIC_URL.
  // Set ASSET_S3_BUCKET to switch to the S3 driver (objects in S3, still served
  // through ASSET_PUBLIC_URL). AWS creds come from the SDK's default chain
  // (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY); AWS_REGION sets the client region.
  ASSET_STORAGE_DIR: z.string().default(".assets"),
  ASSET_PUBLIC_URL: z.string().url().default("http://localhost:4000/assets"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  ASSET_S3_BUCKET: z.string().optional(),
  AWS_REGION: z.string().optional(),
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
