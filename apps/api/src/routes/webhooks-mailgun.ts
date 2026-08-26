import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env, getRedis } from "@rootmail/core";
import { db, messages } from "@rootmail/db";
import { addSuppression } from "../lib/queries";
import { applyProviderOutcome } from "../lib/provider-events";

// Mailgun delivery events.
//
// Without this, sending through Mailgun would work and nothing would come back:
// no bounces, no complaints, no suppression, and a reputation score computed
// from deliveries alone — which would read as perfect while the list rotted.
// A provider you cannot hear from is not a provider you can send through.

/** Mailgun signs `timestamp + token` with HMAC-SHA256. */
function verify(sig: { timestamp?: string; token?: string; signature?: string }): boolean {
  const key = env.MAILGUN_WEBHOOK_SIGNING_KEY;
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

interface MailgunEvent {
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

export async function mailgunWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/webhooks/mailgun", async (req, reply) => {
    const body = req.body as MailgunEvent;

    if (!verify(body.signature ?? {})) {
      return reply.code(403).send({ error: "invalid signature" });
    }

    // Mailgun retries, and its token is unique per delivery attempt — so the
    // token IS the dedupe key, the same shape as the SNS MessageId guard.
    const token = body.signature?.token ?? "";
    const fresh = await getRedis().set(`mg:seen:${token}`, "1", "EX", 3600, "NX");
    if (fresh === null) return reply.code(200).send({ ok: true, duplicate: true });

    const d = body["event-data"];
    if (!d?.event) return reply.code(200).send({ ok: true, ignored: true });

    // Mailgun reports the RFC Message-ID WITHOUT angle brackets here, while the
    // send response includes them. Match on both rather than guessing.
    const raw = d.message?.headers?.["message-id"] ?? "";
    const bare = raw.replace(/^<|>$/g, "");
    const [msg] =
      (await db.select().from(messages).where(eq(messages.providerMessageId, `<${bare}>`)).limit(1))
        .length > 0
        ? await db.select().from(messages).where(eq(messages.providerMessageId, `<${bare}>`)).limit(1)
        : await db.select().from(messages).where(eq(messages.providerMessageId, bare)).limit(1);

    if (!msg) return reply.code(200).send({ ok: true, unmatched: true });

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
          await addSuppression(msg.workspaceId, msg.subTenantId, recipient, "bounce", msg.id, "mailgun");
        }
        break;
      case "complained":
        await applyProviderOutcome(msg, "complained", "Spam complaint", recipient);
        await addSuppression(msg.workspaceId, msg.subTenantId, recipient, "complaint", msg.id, "mailgun");
        break;
      case "unsubscribed":
        await addSuppression(msg.workspaceId, msg.subTenantId, recipient, "unsubscribe", msg.id, "mailgun");
        break;
      default:
        // opened / clicked come from our own tracking, not the provider's.
        break;
    }

    return reply.code(200).send({ ok: true });
  });
}
