import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { env, newId, sendSystemEmail } from "@rootmail/core";
import { billingEvents, db } from "@rootmail/db";
import { paymentFailedEmail, paymentSucceededEmail, trialEndingEmail } from "../lib/emails";
import { getStripe, ownerContactForCustomer, syncSubscription } from "../lib/stripe";

function customerIdOf(c: string | { id: string } | null | undefined): string | null {
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/**
 * Stripe webhook receiver. Public (no API key) but authenticated by Stripe's
 * signature. Encapsulated so its raw-body parser doesn't leak to other routes —
 * signature verification needs the exact bytes Stripe signed, not re-serialized
 * JSON. Idempotent: every event id is recorded once, so redeliveries are no-ops.
 */
export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Capture the raw Buffer instead of parsing JSON (scoped to this plugin).
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  app.post("/v1/webhooks/stripe", async (req, reply) => {
    const stripe = getStripe();
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
      return reply.code(400).send({ error: { type: "bad_request", message: "Stripe not configured" } });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      return reply.code(400).send({ error: { type: "bad_request", message: "Missing signature" } });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
    } catch (err) {
      app.log.warn({ err }, "stripe webhook signature verification failed");
      return reply.code(400).send({ error: { type: "bad_request", message: "Invalid signature" } });
    }

    // Idempotency gate: record the event id; a duplicate insert means we've
    // already handled it, so return 200 without reprocessing.
    const recorded = await db
      .insert(billingEvents)
      .values({ id: newId("billingEvent"), stripeEventId: event.id, type: event.type })
      .onConflictDoNothing()
      .returning();
    if (recorded.length === 0) {
      return reply.code(200).send({ received: true, duplicate: true });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.subscription) {
            const subId =
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription.id;
            await syncSubscription(await stripe.subscriptions.retrieve(subId));
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          await syncSubscription(event.data.object as Stripe.Subscription);
          break;
        }
        // --- Lifecycle email (dogfooded through our own send pipeline) -------
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const cust = customerIdOf(invoice.customer);
          const owner = cust ? await ownerContactForCustomer(cust) : null;
          if (owner) {
            const mail = paymentFailedEmail(owner.name);
            await sendSystemEmail({
              to: owner.email,
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
            });
          }
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          // Only for real charges — skip $0 invoices (trials, 100%-off coupons).
          if ((invoice.amount_paid ?? 0) > 0) {
            const owner = await ownerContactForCustomer(customerIdOf(invoice.customer) ?? "");
            if (owner) {
              const amount = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: (invoice.currency ?? "usd").toUpperCase(),
              }).format((invoice.amount_paid ?? 0) / 100);
              const mail = paymentSucceededEmail(owner.name, {
                amount,
                invoiceUrl: invoice.hosted_invoice_url,
              });
              await sendSystemEmail({
                to: owner.email,
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
              });
            }
          }
          break;
        }
        case "customer.subscription.trial_will_end": {
          const sub = event.data.object as Stripe.Subscription;
          const owner = await ownerContactForCustomer(customerIdOf(sub.customer) ?? "");
          if (owner) {
            const endsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
            const mail = trialEndingEmail(owner.name, endsAt);
            await sendSystemEmail({
              to: owner.email,
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
            });
          }
          break;
        }
        default:
          break; // ignore everything else
      }
    } catch (err) {
      // Let Stripe retry on a processing failure (the event id row stays, so we
      // delete it to allow the retry to reprocess).
      app.log.error({ err, type: event.type }, "stripe webhook processing failed");
      await db.delete(billingEvents).where(eq(billingEvents.stripeEventId, event.id));
      return reply.code(500).send({ error: { type: "internal_error", message: "processing failed" } });
    }

    return reply.code(200).send({ received: true });
  });
}
