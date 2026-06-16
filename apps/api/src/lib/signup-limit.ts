import { getRedis } from "@rootmail/core";

// Cap sign-ups per source IP to blunt mass account creation (abuse / spam farms).
// Counts every attempt in a rolling window; generous enough not to trip a shared
// NAT under normal use.
const MAX_SIGNUPS_PER_IP = 10;
const WINDOW_SECONDS = 60 * 60; // 1 hour

/** Record a sign-up attempt from `ip` and report whether it's within the cap. */
export async function signupAllowed(ip: string): Promise<boolean> {
  const redis = getRedis();
  const key = `signup:ip:${ip}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, WINDOW_SECONDS);
  return n <= MAX_SIGNUPS_PER_IP;
}
