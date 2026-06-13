import { Queue, type ConnectionOptions } from "bullmq";
import type { Priority } from "./constants";
import { getRedis } from "./redis";

// BullMQ bundles its own ioredis types; this monorepo may resolve a different
// patch of ioredis. The instances are runtime-compatible, so we present our
// connection as BullMQ's ConnectionOptions at the boundary.
export function bullConnection(): ConnectionOptions {
  return getRedis() as unknown as ConnectionOptions;
}

// Note: BullMQ disallows ":" in queue names (it's the internal Redis key separator).
export const SEND_QUEUE = "rootmail-send";

export interface SendJobData {
  messageId: string;
  workspaceId: string;
}

// BullMQ: lower number = higher priority.
export const QUEUE_PRIORITY: Record<Priority, number> = {
  high: 1,
  normal: 5,
  low: 10,
};

let sendQueue: Queue<SendJobData> | undefined;

export function getSendQueue(): Queue<SendJobData> {
  if (sendQueue) return sendQueue;
  sendQueue = new Queue<SendJobData>(SEND_QUEUE, { connection: bullConnection() });
  return sendQueue;
}

export interface EnqueueOptions {
  priority?: Priority;
  /** Delay before the job becomes available (used for scheduled `send_at`). */
  delayMs?: number;
}

export async function enqueueSend(data: SendJobData, opts: EnqueueOptions = {}) {
  const queue = getSendQueue();
  return queue.add("send", data, {
    priority: QUEUE_PRIORITY[opts.priority ?? "normal"],
    delay: opts.delayMs && opts.delayMs > 0 ? opts.delayMs : undefined,
    attempts: 4,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 86_400, count: 5_000 },
    removeOnFail: { age: 7 * 86_400 },
    // One job per message — protects against duplicate enqueues (queue-level idempotency).
    jobId: data.messageId,
  });
}
