import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env, getRedis } from "@rootmail/core";
import { db, messages, workspaces } from "@rootmail/db";
import { addSuppression } from "../lib/queries";
import { applyProviderOutcome } from "../lib/provider-events";

// Mailgun delivery events.
//
// Without this, sending through Mailgun would work and nothing would come back:
// no bounces, no complaints, no suppression, and a reputation score computed
// from deliveries alone — which would read as perfect while the list rotted.
// A provider you cannot hear from is not a provider you can send through.

/** Mailgun signs `timestamp + token` with HMAC-SHA256. */
export function verifyMailgunSignature(
  sig: { timestamp?: string; token?: string; signature?: string },
  key: string | undefined = env.MAILGUN_WEBHOOK_SIGNING_KEY,
): boolean {
  if (!key || !sig.timestamp || !sig.token || !sig.signature) return false;

  // Replay window. The token dedupe below is the real guard, but an ancient
  // timestamp is not something to spend a hash on.
  const age = Math.abs(Date.now() / 1000 - Number(sig.timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac("sha256", key).update(`${sig.timestamp}${sig.token}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig.signature, "utf8");
  // Length must match before timingSafeEqual, which throws otherwise — and the
  // length itself is not a secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface MailgunEvent {
  signature?: { timestamp?: string; token?: string; signature?: string };
  "event-data"?: {
    event?: string;
    severity?: string;
    reason?: string;
    recipient?: string;
    message?: { headers?: { "message-id"?: string } };
    "delivery-status"?: { message?: string; description?: string };
  };
}

export interface MailgunEventScope {
  /** Signing key to verify with. Global route: ours. BYO route: the tenant's. */
  key: string | undefined;
  /** BYO: only messages of this organization may be matched. */
  organizationId?: string;
  /** Source recorded on suppressions. */
  source: string;
}

async function findMessage(providerMessageId: string, organizationId?: string) {
  if (!organizationId) {
    const [m] = await db.select().from(messages).where(eq(messages.providerMessageId, providerMessageId)).limit(1);
    return m;
  }
  const [row] = await db
    .select({ m: messages })
    .from(messages)
    .innerJoin(workspaces, eq(workspaces.id, messages.workspaceId))
    .where(and(eq(messages.providerMessageId, providerMessageId), eq(workspaces.organizationId, organizationId)))
    .limit(1);
  return row?.m;
}

/** Verify, dedupe and apply one Mailgun event. Shared by the global and the per-tenant routes. */
export async function handleMailgunEvent(
  body: MailgunEvent,
  scope: MailgunEventScope,
): Promise<{ code: number; body: Record<string, unknown> }> {
  if (!verifyMailgunSignature(body.signature ?? {}, scope.key)) {
    return { code: 403, body: { error: "invalid signature" } };
  }

  // Mailgun retries, and its token is unique per delivery attempt — so the
  // token IS the dedupe key, the same shape as the SNS MessageId guard.
  const token = body.signature?.token ?? "";
  const dedupeKey = scope.organizationId ? `mg:seen:${scope.organizationId}:${token}` : `mg:seen:${token}`;
  const fresh = await getRedis().set(dedupeKey, "1", "EX", 3600, "NX");
  if (fresh === null) return { code: 200, body: { ok: true, duplicate: true } };

  const d = body["event-data"];
  if (!d?.event) return { code: 200, body: { ok: true, ignored: true } };

  // Mailgun reports the RFC Message-ID WITHOUT angle brackets here, while the
  // send response includes them. Match on both rather than guessing.
  const raw = d.message?.headers?.["message-id"] ?? "";
  const bare = raw.replace(/^<|>$/g, "");
  const msg = (await findMessage(`<${bare}>`, scope.organizationId)) ?? (await findMessage(bare, scope.organizationId));

  if (!msg) return { code: 200, body: { ok: true, unmatched: true } };

  const recipient = d.recipient ?? msg.toEmail;
  const reason = d["delivery-status"]?.description || d["delivery-status"]?.message || d.reason || null;

  switch (d.event) {
    case "delivered":
      await applyProviderOutcome(msg, "delivered", null, recipient);
      break;
    case "failed":
      // `permanent` is a hard bounce; `temporary` is a retry Mailgun is still
      // making on our behalf and must NOT suppress the address.
      if (d.severity === "permanent") {
        await applyProviderOutcome(msg, "bounced", reason, recipient);
        await addSuppression(msg.workspaceId, msg.subTenantId, recipient, "bounce", msg.id, scope.source);
      }
      break;
    case "complained":
      await applyProviderOutcome(msg, "complained", "Spam complaint", recipient);
      await addSuppression(msg.workspaceId, msg.subTenantId, recipient, "complaint", msg.id, scope.source);
      break;
    case "unsubscribed":
      await addSuppression(msg.workspaceId, msg.subTenantId, recipient, "unsubscribe", msg.id, scope.source);
      break;
    default:
      // opened / clicked come from our own tracking, not the provider's.
      break;
  }

  return { code: 200, body: { ok: true } };
}

export async function mailgunWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/webhooks/mailgun", async (req, reply) => {
    const out = await handleMailgunEvent(req.body as MailgunEvent, {
      key: env.MAILGUN_WEBHOOK_SIGNING_KEY,
      source: "mailgun",
    });
    return reply.code(out.code).send(out.body);
  });
}
