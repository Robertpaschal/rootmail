import { Redis } from "ioredis";
import { env } from "./env";

// BullMQ requires `maxRetriesPerRequest: null` on its connections.
const options = { maxRetriesPerRequest: null as null } as const;

let shared: Redis | undefined;

/** Shared connection for non-blocking work (enqueue, idempotency cache, rate limits). */
export function getRedis(): Redis {
  if (!shared) {
    shared = new Redis(env.REDIS_URL, options);
  }
  return shared;
}

/** A dedicated connection — BullMQ Workers need their own (they issue blocking commands). */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, options);
}

/**
 * Close the shared connection and forget it, so the next `getRedis()` opens a
 * fresh one.
 *
 * The counterpart to `closeDb()` and `closeQueues()`. `getRedis()` is a process
 * singleton backing enqueue, the idempotency cache and rate limits, and nothing
 * closed it — so any `node:test` file that exercised a route touching Redis
 * left an open handle and the run HUNG with no output rather than failing,
 * which reads as an infinite loop in the code under test. Only tests that
 * enqueue hit this, which is why it went unnoticed until one existed.
 *
 * Idempotent: safe when no connection was ever opened.
 */
export async function closeRedis(): Promise<void> {
  const open = shared;
  shared = undefined;
  if (open) await open.quit().catch(() => open.disconnect());
}
