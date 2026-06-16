import { getRedis } from "@rootmail/core";

// Temporary lockout after repeated failed credential checks (anti-brute-force).
// A per-identity counter in Redis with a sliding TTL; cleared on success. Keyed
// by "pw" (password login, by email) or "mfa" (TOTP step, by user id).
const MAX_FAILURES = 10;
const WINDOW_SECONDS = 15 * 60;

function key(scope: string, id: string): string {
  return `auth:fail:${scope}:${id.toLowerCase()}`;
}

export async function isLockedOut(scope: string, id: string): Promise<boolean> {
  const n = await getRedis().get(key(scope, id));
  return n !== null && Number(n) >= MAX_FAILURES;
}

export async function recordAuthFailure(scope: string, id: string): Promise<void> {
  const redis = getRedis();
  const k = key(scope, id);
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, WINDOW_SECONDS); // start the window on first failure
}

export async function clearAuthFailures(scope: string, id: string): Promise<void> {
  await getRedis().del(key(scope, id));
}
