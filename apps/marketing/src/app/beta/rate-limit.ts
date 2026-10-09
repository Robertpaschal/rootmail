import { createHash, randomBytes } from "node:crypto";

/**
 * Per-person limit for "send me a new confirmation link".
 *
 * The first brake, not the only one. The API keeps the shared limits (per
 * address, and per visitor IP using the address this server forwards with
 * INTERNAL_API_SECRET). This one still matters when that secret is not set,
 * because then the API sees all of rootmail.io as a single IP. In memory and
 * per process, like /check's limiter (no Redis in apps/marketing by design).
 *
 * Client addresses are hashed with a per-process salt and never stored raw.
 */

const WINDOW_MS = 3_600_000;
const PER_IP = 5;
const SALT = randomBytes(16);
const seen = new Map<string, number[]>();

export function takeResend(ip: string): boolean {
  const now = Date.now();
  const k = createHash("sha256").update(SALT).update(ip).digest("base64url").slice(0, 22);
  const mine = (seen.get(k) ?? []).filter((t) => t > now - WINDOW_MS);
  if (mine.length >= PER_IP) {
    seen.set(k, mine);
    return false;
  }
  mine.push(now);
  seen.set(k, mine);
  if (seen.size > 5_000) {
    for (const [key, times] of seen) if (!times.some((t) => t > now - WINDOW_MS)) seen.delete(key);
  }
  return true;
}
