import { createHash, randomBytes } from "node:crypto";

/**
 * `/check` rate limit. Spec: `docs/design/04-EXPERIENCE.md` §6.4 — 10/hour/IP,
 * 200/hour globally.
 *
 * In memory, per process. `apps/marketing` has no Redis and deliberately no
 * backend dependency (CLAUDE.md), and this guards an unauthenticated DNS lookup
 * rather than anything with a cost or a side effect, so a per-instance window is
 * the honest ceiling. If this ever needs to hold across instances it moves to the
 * API's `@fastify/rate-limit`, which is already registered there.
 *
 * PRIVACY: the raw client address is never stored. It is hashed with a salt
 * generated at process start, so the table is unusable outside this process and
 * disappears when it exits. The domain is not passed to this module at all —
 * nothing here should ever be able to associate an address with a lookup.
 */

const WINDOW_MS = 3_600_000;
const PER_IP = 10;
const GLOBAL = 200;

const SALT = randomBytes(16);

const perIp = new Map<string, number[]>();
let global: number[] = [];

function key(ip: string): string {
  return createHash("sha256").update(SALT).update(ip).digest("base64url").slice(0, 22);
}

const since = (times: number[], cutoff: number) => times.filter((t) => t > cutoff);

export type RateVerdict =
  | { ok: true; remaining: number }
  | { ok: false; scope: "ip" | "global"; retryAfterSeconds: number };

/** Consume one lookup. Call once per domain actually looked up. */
export function takeLookup(ip: string): RateVerdict {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  global = since(global, cutoff);
  if (global.length >= GLOBAL) {
    return { ok: false, scope: "global", retryAfterSeconds: retryIn(global, now, GLOBAL) };
  }

  const k = key(ip);
  const mine = since(perIp.get(k) ?? [], cutoff);
  if (mine.length >= PER_IP) {
    perIp.set(k, mine);
    return { ok: false, scope: "ip", retryAfterSeconds: retryIn(mine, now, PER_IP) };
  }

  mine.push(now);
  perIp.set(k, mine);
  global.push(now);

  // Keep the table from growing without bound on a long-lived process.
  if (perIp.size > 5_000) {
    for (const [k2, times] of perIp) {
      const live = since(times, cutoff);
      if (live.length === 0) perIp.delete(k2);
      else perIp.set(k2, live);
    }
  }

  return { ok: true, remaining: PER_IP - mine.length };
}

function retryIn(times: number[], now: number, limit: number): number {
  const oldestThatCounts = times[times.length - limit] ?? times[0]!;
  return Math.max(1, Math.ceil((oldestThatCounts + WINDOW_MS - now) / 1000));
}

export const LIMITS = { perIp: PER_IP, global: GLOBAL, windowMs: WINDOW_MS };

/**
 * The client address, taken as the RIGHTMOST entry of `X-Forwarded-For`.
 *
 * A proxy appends the address it observed, so the rightmost hop is the one our
 * own edge saw; the leftmost is whatever the client claimed and is free to
 * forge. Same reasoning as `TRUST_PROXY` in `packages/core/src/env.ts`.
 */
export function clientAddress(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
