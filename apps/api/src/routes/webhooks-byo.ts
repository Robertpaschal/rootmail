import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { announceProviderChange, BYO_AWAITING_FEEDBACK, byoEffective, byoGloballyEnabled, getRedis, openCredentials, snsTopicMatches } from "@rootmail/core";
import { db, organizations, orgSendingProviders } from "@rootmail/db";
import { applySesNotification, classify, parseSesNotification } from "../lib/ses-events";
import { confirmSubscription, type SnsMessage, verifySnsSignature } from "../lib/sns";
import { handleMailgunEvent, type MailgunEvent } from "./webhooks-mailgun";

// Per-tenant bounce / complaint feedback for bring-your-own-provider.
//
//   POST /v1/webhooks/byo/:token/ses       ← the tenant's SNS topic
//   POST /v1/webhooks/byo/:token/mailgun   ← the tenant's Mailgun webhooks
//
// The token only NAMES the connection; it authenticates nothing. Every event is
// still verified — SNS by Amazon's signature AND an exact match on the topic the
// tenant registered, Mailgun by the tenant's own signing key — and can only
// touch messages of the connection's organization. Suppression is the same
// pipeline as our own provider's.

const DEDUP_TTL_SECONDS = 60 * 60 * 24 * 7;

async function connectionFor(token: string, provider: "ses" | "mailgun") {
  if (!byoGloballyEnabled() || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ conn: orgSendingProviders, flag: organizations.byoProvider })
    .from(orgSendingProviders)
    .innerJoin(organizations, eq(organizations.id, orgSendingProviders.organizationId))
    .where(eq(orgSendingProviders.webhookToken, token))
    .limit(1);
  if (!row || !byoEffective(row.flag) || row.conn.provider !== provider) return null;
  return row.conn;
}

export async function byoWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(["text/plain", "application/json"], { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post<{ Params: { token: string } }>("/v1/webhooks/byo/:token/ses", async (req, reply) => {
    const conn = await connectionFor(req.params.token, "ses");
    if (!conn) return reply.code(404).send({ error: "not found" });

    const msg = req.body as SnsMessage | undefined;
    if (!msg || typeof msg.Type !== "string" || typeof msg.Signature !== "string") {
      return reply.code(400).send({ error: "bad request" });
    }
    let valid = false;
    try {
      valid = await verifySnsSignature(msg);
    } catch (err) {
      app.log.warn({ err }, "BYO SNS signature verification error");
    }
    if (!valid) return reply.code(403).send({ error: "invalid signature" });

    // Signed by Amazon is not enough: it must be the exact topic this tenant
    // registered, or anyone's topic could post events at this tenant's URL.
    if (!snsTopicMatches(conn.snsTopicArn, msg.TopicArn)) {
      app.log.warn({ org: conn.organizationId }, "BYO SNS message from an unregistered topic — ignoring");
      return reply.code(403).send({ error: "unrecognized topic" });
    }

    if (msg.Type === "SubscriptionConfirmation") {
      await confirmSubscription(msg, (arn) => snsTopicMatches(conn.snsTopicArn, arn));
      // Feedback is now flowing, so the connection may send.
      if (conn.status === BYO_AWAITING_FEEDBACK) {
        await db
          .update(orgSendingProviders)
          .set({ status: "active", lastError: null, lastCheckedAt: new Date(), updatedAt: new Date() })
          .where(eq(orgSendingProviders.id, conn.id));
        await announceProviderChange(conn.organizationId);
      }
      return reply.code(200).send({ ok: true });
    }
    if (msg.Type !== "Notification") return reply.code(200).send({ ok: true });

    const dedupeKey = `sns:seen:byo:${conn.organizationId}:${msg.MessageId}`;
    const fresh = await getRedis().set(dedupeKey, "1", "EX", DEDUP_TTL_SECONDS, "NX");
    if (fresh === null) return reply.code(200).send({ ok: true, duplicate: true });

    const n = parseSesNotification(msg.Message);
    // Inbound mail is never accepted through a tenant topic; replies come only
    // through our own receiving domain.
    if (n && classify(n) !== "received") {
      try {
        const kind = await applySesNotification(n, { organizationId: conn.organizationId, source: "byo:ses" });
        app.log.info({ kind, org: conn.organizationId }, "processed BYO SES notification");
      } catch (err) {
        // Let SNS's retry through: a lost bounce is a lost suppression.
        await getRedis().del(dedupeKey);
        throw err;
      }
    }
    return reply.code(200).send({ ok: true });
  });

  app.post<{ Params: { token: string } }>("/v1/webhooks/byo/:token/mailgun", async (req, reply) => {
    const conn = await connectionFor(req.params.token, "mailgun");
    if (!conn) return reply.code(404).send({ error: "not found" });
    let key: string | undefined;
    try {
      key = (JSON.parse(openCredentials(conn.credentials)) as { webhookSigningKey?: string }).webhookSigningKey;
    } catch {
      key = undefined; // unreadable → every signature fails; never logged
    }
    const out = await handleMailgunEvent(req.body as MailgunEvent, {
      key,
      organizationId: conn.organizationId,
      source: "byo:mailgun",
      releaseDedupeOnError: true,
    });
    return reply.code(out.code).send(out.body);
  });
}
