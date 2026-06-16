import type { FastifyInstance } from "fastify";
import { getRedis } from "@rootmail/core";
import { applySesNotification, parseSesNotification } from "../lib/ses-events";
import { confirmSubscription, type SnsMessage, verifySnsSignature } from "../lib/sns";

// SNS may redeliver a notification; dedup by its envelope MessageId so we don't
// double-audit / double-fire outbound webhooks. (Suppression itself is already
// idempotent, but audit entries are append-only.)
const DEDUP_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * SES feedback receiver (Bounce / Complaint / Delivery via SNS). Public — like
 * the Stripe webhook — but authenticated by SNS's signature, not an API key.
 * Encapsulated so its raw-body parser stays scoped to this route.
 */
export async function sesWebhookRoutes(app: FastifyInstance): Promise<void> {
  // SNS posts JSON but with Content-Type text/plain; parse the raw string here.
  app.addContentTypeParser(
    ["text/plain", "application/json"],
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post("/v1/webhooks/ses", async (req, reply) => {
    const msg = req.body as SnsMessage | undefined;
    if (!msg || typeof msg.Type !== "string" || typeof msg.Signature !== "string") {
      return reply.code(400).send({ error: "bad request" });
    }

    let valid = false;
    try {
      valid = await verifySnsSignature(msg);
    } catch (err) {
      app.log.warn({ err }, "SNS signature verification error");
    }
    if (!valid) return reply.code(403).send({ error: "invalid signature" });

    if (msg.Type === "SubscriptionConfirmation") {
      await confirmSubscription(msg);
      app.log.info({ topic: msg.TopicArn }, "confirmed SNS subscription");
      return reply.code(200).send({ ok: true });
    }
    if (msg.Type !== "Notification") return reply.code(200).send({ ok: true });

    const redis = getRedis();
    const fresh = await redis.set(`sns:seen:${msg.MessageId}`, "1", "EX", DEDUP_TTL_SECONDS, "NX");
    if (fresh === null) return reply.code(200).send({ ok: true, duplicate: true });

    const notification = parseSesNotification(msg.Message);
    if (notification) {
      const kind = await applySesNotification(notification);
      app.log.info({ kind, messageId: msg.MessageId }, "processed SES notification");
    }
    return reply.code(200).send({ ok: true });
  });
}
