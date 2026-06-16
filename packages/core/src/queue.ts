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

// ---------------------------------------------------------------------------
// Sequences — a repeatable "tick" advances all due enrollments. Campaigns —
// one job fans a campaign out to its list.
// ---------------------------------------------------------------------------
export const SEQUENCE_QUEUE = "rootmail-sequences";
export const CAMPAIGN_QUEUE = "rootmail-campaigns";

let sequenceQueue: Queue | undefined;
export function getSequenceQueue(): Queue {
  if (!sequenceQueue) sequenceQueue = new Queue(SEQUENCE_QUEUE, { connection: bullConnection() });
  return sequenceQueue;
}

/** Register the repeatable sequence tick (idempotent — fixed repeat jobId). */
export async function scheduleSequenceTick(everyMs = 60_000): Promise<void> {
  await getSequenceQueue().add(
    "tick",
    {},
    { repeat: { every: everyMs }, jobId: "sequence-tick", removeOnComplete: true, removeOnFail: { count: 50 } },
  );
}

export interface CampaignJob {
  campaignId: string;
  workspaceId: string;
}

let campaignQueue: Queue<CampaignJob> | undefined;
export function getCampaignQueue(): Queue<CampaignJob> {
  if (!campaignQueue) campaignQueue = new Queue<CampaignJob>(CAMPAIGN_QUEUE, { connection: bullConnection() });
  return campaignQueue;
}

export async function enqueueCampaignSend(data: CampaignJob, opts: { delayMs?: number } = {}): Promise<void> {
  await getCampaignQueue().add("send", data, {
    delay: opts.delayMs && opts.delayMs > 0 ? opts.delayMs : undefined,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { age: 86_400 },
    removeOnFail: { age: 7 * 86_400 },
    jobId: data.campaignId, // one fan-out per campaign
  });
}

// ---------------------------------------------------------------------------
// Platform/transactional email (email verification, password reset). These are
// NOT tied to a customer workspace or the send quota — the worker delivers them
// straight through the configured provider. Durable retries via BullMQ.
// ---------------------------------------------------------------------------
export const SYSTEM_MAIL_QUEUE = "rootmail-system-mail";

export interface SystemMailJob {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Sender; defaults to no-reply@<ROOTMAIL_DOMAIN> in the worker when omitted. */
  from?: string | null;
}

let systemMailQueue: Queue<SystemMailJob> | undefined;
export function getSystemMailQueue(): Queue<SystemMailJob> {
  if (!systemMailQueue) {
    systemMailQueue = new Queue<SystemMailJob>(SYSTEM_MAIL_QUEUE, { connection: bullConnection() });
  }
  return systemMailQueue;
}

/** Enqueue a platform email (verification, reset). Safe to await in a request
 * path; delivery + retries happen in the worker. */
export async function sendSystemEmail(job: SystemMailJob): Promise<void> {
  await getSystemMailQueue().add("send", job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 7 * 86_400 },
  });
}
