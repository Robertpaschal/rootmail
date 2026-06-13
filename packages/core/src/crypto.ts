import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { WorkspaceEnvironment } from "./constants";

export interface GeneratedApiKey {
  /** Full secret — shown to the user exactly once, never stored. */
  key: string;
  /** SHA-256 hex digest stored in the database for lookup. */
  hash: string;
  /** `rm_live` | `rm_test` — safe to display. */
  prefix: string;
  /** Last 4 chars for display, e.g. `…a1b2`. */
  last4: string;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(mode: WorkspaceEnvironment): GeneratedApiKey {
  const prefix = `rm_${mode}`;
  const secret = randomBytes(24).toString("base64url");
  const key = `${prefix}_${secret}`;
  return { key, hash: hashApiKey(key), prefix, last4: key.slice(-4) };
}

/** URL-safe random token, used for domain-verification TXT values, etc. */
export function randomToken(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison for secrets / signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
