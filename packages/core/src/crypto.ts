import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

/** Base64url HMAC-SHA256 — for signing tamper-proof links (e.g. unsubscribe). */
export function hmacSign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

// ---------------------------------------------------------------------------
// Passwords (scrypt — dependency-free, via node:crypto)
// ---------------------------------------------------------------------------
const SCRYPT_KEYLEN = 64;

/** Hash a password as `scrypt$salt$hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

/** Verify a password against a stored `scrypt$salt$hash`, in constant time. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// Session tokens (dashboard login)
// ---------------------------------------------------------------------------
export interface GeneratedSessionToken {
  /** Full token — set in the session cookie, never stored. */
  token: string;
  /** SHA-256 hex digest stored in the database for lookup. */
  hash: string;
}

/** Mint an opaque session token (`rms_…`); only its hash is persisted. */
export function generateSessionToken(): GeneratedSessionToken {
  const token = `rms_${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256Hex(token) };
}
