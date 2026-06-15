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

// ---------------------------------------------------------------------------
// Outbound dev webhooks. Producers (API/worker) enqueue a lightweight "event"
// job; the webhook worker fans out to matching endpoints and delivers each with
// its own retries/backoff.
// ---------------------------------------------------------------------------
export const WEBHOOK_QUEUE = "rootmail-webhooks";

export interface WebhookEventJob {
  workspaceId: string;
  subTenantId: string | null;
  event: string;
  /** Minimal payload — ids/status only (no content/PII beyond the recipient). */
  data: Record<string, unknown>;
}

/** Per-endpoint delivery job (the fan-out target). */
export interface WebhookDeliverJob {
  endpointId: string;
  event: string;
  /** The exact signed request body. */
  body: string;
}

export type WebhookJob = WebhookEventJob | WebhookDeliverJob;

let webhookQueue: Queue<WebhookJob> | undefined;

export function getWebhookQueue(): Queue<WebhookJob> {
  if (webhookQueue) return webhookQueue;
  webhookQueue = new Queue<WebhookJob>(WEBHOOK_QUEUE, { connection: bullConnection() });
  return webhookQueue;
}

/** Fire-and-forget: enqueue a webhook event for fan-out. Never throws into the
 * caller's path (a webhook hiccup must not fail a send or an audit write). */
export async function enqueueWebhookEvent(data: WebhookEventJob): Promise<void> {
  try {
    await getWebhookQueue().add("event", data, {
      attempts: 2,
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    });
  } catch (err) {
    console.warn(`[webhooks] failed to enqueue ${data.event}: ${String(err)}`);
  }
}
