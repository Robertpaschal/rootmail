import { createHash, randomBytes } from "node:crypto";

/**
 * Per-person limit for "send me a new confirmation link".
 *
 * The API cannot do this one: every request it sees comes from this server,
 * so to the API all of rootmail.io is one IP. The person's own address is only
 * known here. In memory and per process, like /check's limiter (no Redis in
 * apps/marketing by design); the API adds a shared per-address and per-IP limit
 * behind it, so this is the first brake, not the only one.
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
