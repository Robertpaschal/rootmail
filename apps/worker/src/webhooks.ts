import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import {
  assertPublicUrl,
  getWebhookQueue,
  newId,
  WEBHOOK_DISABLE_THRESHOLD,
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookDeliverJob,
  type WebhookEventJob,
  webhookSignature,
} from "@rootmail/core";
import { db, webhookDeliveries, webhookEndpoints } from "@rootmail/db";

async function record(
  endpointId: string,
  event: string,
  status: "success" | "failed",
  attempt: number,
  responseStatus: number | null,
  error: string | null,
): Promise<void> {
  await db.insert(webhookDeliveries).values({
    id: newId("webhookDelivery"),
    endpointId,
    event,
    status,
    attempt,
    responseStatus,
    error,
  });
}

/** Fan an event out to every active endpoint subscribed to it. */
async function fanOut(data: WebhookEventJob): Promise<void> {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.workspaceId, data.workspaceId),
        eq(webhookEndpoints.status, "active"),
      ),
    );
  const matching = endpoints.filter((e) => e.events.includes("*") || e.events.includes(data.event));
  if (matching.length === 0) return;

  // Sign the exact bytes each receiver will get.
  const body = JSON.stringify({
    event: data.event,
    occurred_at: new Date().toISOString(),
    data: data.data,
  });
  const queue = getWebhookQueue();
  for (const e of matching) {
    await queue.add(
      "deliver",
      { endpointId: e.id, event: data.event, body } satisfies WebhookDeliverJob,
      {
        attempts: WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 },
      },
    );
  }
}

/** Deliver one signed POST to one endpoint, with retries + auto-disable. */
async function deliver(job: Job<WebhookDeliverJob>): Promise<void> {
  const { endpointId, event, body } = job.data;
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .limit(1);
  if (!endpoint || endpoint.status !== "active") return; // deleted or disabled — drop

  const attempt = job.attemptsMade + 1;
  const isFinal = attempt >= (job.opts.attempts ?? WEBHOOK_MAX_ATTEMPTS);

  const fail = async (error: string, responseStatus: number | null = null): Promise<void> => {
    await record(endpoint.id, event, "failed", attempt, responseStatus, error);
    if (!isFinal) throw new Error(error); // let BullMQ retry with backoff
    // Final failure: bump the counter and auto-disable a chronically broken endpoint.
    const failures = endpoint.consecutiveFailures + 1;
    const disabled = failures >= WEBHOOK_DISABLE_THRESHOLD;
    await db
      .update(webhookEndpoints)
      .set({
        consecutiveFailures: failures,
        status: disabled ? "disabled" : endpoint.status,
        disabledAt: disabled ? new Date() : endpoint.disabledAt,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));
  };

  // Re-validate at delivery time (defends against DNS rebinding / a host that
  // now points somewhere internal).
  try {
    await assertPublicUrl(endpoint.url);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "blocked URL");
  }

  const ts = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "rootmail-webhooks/1",
        "Rootmail-Event": event,
        "Rootmail-Signature": webhookSignature(body, endpoint.secret, ts),
      },
      body,
      redirect: "error", // never follow redirects — a 30x to an internal host is an SSRF vector
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : "network error";
    return fail(msg);
  }
  clearTimeout(timer);

  if (!res.ok) return fail(`HTTP ${res.status}`, res.status);

  await record(endpoint.id, event, "success", attempt, res.status, null);
  if (endpoint.consecutiveFailures !== 0) {
    await db
      .update(webhookEndpoints)
      .set({ consecutiveFailures: 0, updatedAt: new Date() })
      .where(eq(webhookEndpoints.id, endpoint.id));
  }
}

export async function processWebhookJob(job: Job): Promise<void> {
  if (job.name === "event") return fanOut(job.data as WebhookEventJob);
  if (job.name === "deliver") return deliver(job as Job<WebhookDeliverJob>);
}
