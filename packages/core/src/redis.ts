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
