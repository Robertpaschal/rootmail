import { getRedis } from "./redis";
import { REPUTATION_THROTTLE_PER_HOUR } from "./reputation";

// The per-tenant send meter used when a tenant is in `throttled`.
//
// A fixed window rather than a leaky bucket, deliberately: the guarantee we need
// is "this tenant cannot send more than N an hour", and a counter keyed by the
// hour gives exactly that in two commands with no background refill. The classic
// fixed-window objection — up to 2N across a window boundary — is irrelevant at
// a rate this low, and the alternative costs a Lua script to stay atomic.

const WINDOW_SEC = 3600;

function windowKey(subTenantId: string, now = Date.now()): string {
  return `rep:throttle:${subTenantId}:${Math.floor(now / (WINDOW_SEC * 1000))}`;
}

export interface ThrottleVerdict {
  allowed: boolean;
  /** Sends already taken from this window (including this attempt). */
  used: number;
  limit: number;
  /** Milliseconds until the next window opens — the delay to re-queue with. */
  retryInMs: number;
}

/**
 * Take one token for a throttled tenant.
 *
 * Consumes on every call, including refused ones. That is intentional: the caller
 * re-queues a refused send into the NEXT window, so a refusal is not a retry of
 * this window and over-counting here cannot starve anything. Keeping it to a bare
 * INCR/EXPIRE means the meter can never disagree with itself under concurrency.
 */
export async function takeThrottleToken(
  subTenantId: string,
  limit = REPUTATION_THROTTLE_PER_HOUR,
): Promise<ThrottleVerdict> {
  const now = Date.now();
  const key = windowKey(subTenantId, now);
  const redis = getRedis();

  const used = await redis.incr(key);
  // Set the TTL once, on the first token of the window.
  if (used === 1) await redis.expire(key, WINDOW_SEC + 60);

  const elapsed = now % (WINDOW_SEC * 1000);
  return {
    allowed: used <= limit,
    used,
    limit,
    retryInMs: WINDOW_SEC * 1000 - elapsed,
  };
}

/** Clear a tenant's meter — called when it leaves `throttled`. */
export async function clearThrottle(subTenantId: string): Promise<void> {
  await getRedis().del(windowKey(subTenantId));
}

/**
 * A plain "did this happen too recently / too often" counter, for public
 * endpoints that send mail to an address nobody has authenticated.
 *
 * The subscribe endpoint is the case this exists for: unauthenticated, one real
 * email per POST, list ids visible in the hosted page URL, and no per-address
 * cooldown. That is a subscription bomb — point it at a victim's address in a
 * loop and we deliver the abuse. AWS names this pattern in its Acceptable Use
 * Policy specifically, and the only brake was a global 300/min limiter shared
 * with every other route.
 *
 * Deliberately NOT the token bucket above: this counts distinct occurrences over
 * a window rather than metering a send rate, and it must not consume on refusal
 * — a refused signup should not extend its own cooldown.
 */
export async function checkAndCount(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; used: number; retryInSec: number }> {
  const redis = getRedis();
  const k = `rl:${key}`;
  const used = Number((await redis.get(k)) ?? 0);
  if (used >= limit) {
    const ttl = await redis.ttl(k);
    return { allowed: false, used, retryInSec: ttl > 0 ? ttl : windowSec };
  }
  const next = await redis.incr(k);
  if (next === 1) await redis.expire(k, windowSec);
  return { allowed: true, used: next, retryInSec: windowSec };
}
