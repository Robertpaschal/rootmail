import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { admitSubscriber, contacts, db } from "@rootmail/db";
import { AppError } from "@rootmail/core";
import { betaInviteRequired } from "../lib/beta";
import { resendClientIp, resendTesterConfirmation, takeResendSlot, track } from "../lib/beta-resend";
import { autoAdmitRemaining, betaWaitlistAudience } from "../lib/beta-waitlist";
import { ensureTesterIdentity } from "../lib/ses-provisioning";
import { parse } from "../lib/validate";

// PUBLIC. rootmail.io/beta posts here. No auth, by design — this is the front
// door of a closed beta, so it must be reachable by someone who has nothing.

const waitlistBody = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
  /** What they actually want to send. The reason to talk to them at all. */
  use_case: z.string().trim().max(600).optional(),
  /** Roughly how much mail. Free text — a range is more honest than a number. */
  volume: z.string().trim().max(60).optional(),
  /** Honeypot. Humans never fill it; bots do. Accepted, then dropped. */
  website: z.string().optional(),
});

const resendBody = z.object({
  email: z.string().email(),
  /** Same honeypot as the signup form. */
  website: z.string().optional(),
});

/**
 * The one answer the resend endpoint ever gives (bar a 429). Identical whether
 * the address is on the list, unknown, already confirmed or still within its
 * 24 hours — so it cannot be used to find out who has asked to join.
 */
export const RESEND_NEUTRAL = {
  ok: true,
  message:
    "If that address is on our waitlist, a confirmation email from Amazon Web Services is on its way or already in your inbox. Check spam too. Each link works for 24 hours; if yours has expired, we have asked for a new one.",
} as const;

export async function betaWaitlistRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/beta/waitlist", async (req, reply) => {
    const body = parse(waitlistBody, req.body);

    // A bot filled the hidden field. Answer exactly as we would a human, so it
    // learns nothing, and write nothing.
    if (body.website) return reply.code(202).send({ ok: true, status: "waiting" });

    const { workspaceId, list } = await betaWaitlistAudience();

    // Sandbox reality: we may only mail a VERIFIED identity, so ask SES to
    // verify their address the moment they ask for access rather than at
    // admission — that way the confirmation is already sitting in their inbox
    // by the time we want to send the invite. Best-effort: a failure here must
    // not lose the signup, it only delays the invite.
    void ensureTesterIdentity(body.email)
      .then((r) => {
        // Best-effort must not mean invisible. This returns a result rather
        // than throwing, so a bare .catch() swallowed nothing and logged
        // nothing — and a missing IAM action looked exactly like success.
        if (!r.ok) req.log.error({ email: body.email, reason: r.reason }, "tester verification failed");
      })
      .catch((err) => req.log.error({ err }, "tester verification threw"));

    // No code yet. It is minted when they VERIFY (promoteVerifiedTesters), not
    // here: a code minted now holds its seat for a week, and someone who takes
    // eight days to click Amazon's link would be invited with a dead code.

    const result = await admitSubscriber({
      workspaceId,
      subTenantId: null,
      list,
      email: body.email,
      name: body.name ?? null,
      source: "waitlist",
      confirmed: true,
      // Our own account is unmetered, so a waitlist can never be turned away
      // for capacity — but pass the real shape rather than a magic number.
      capacityRemaining: Number.POSITIVE_INFINITY,
      metadata: {
        ...(body.use_case ? { beta_use_case: body.use_case } : {}),
        ...(body.volume ? { beta_volume: body.volume } : {}),
        beta_signed_up_at: new Date().toISOString(),
      },
    });

    // `waitlisted` carries no contact row — that state exists for a customer
    // who has run out of contact slots, which our own unmetered account never
    // does. Narrow rather than assume, so a future capacity rule can't crash us.
    const contactId = "contactId" in result ? result.contactId : null;

    // Keep what they told us. This is the difference between a list of
    // addresses and knowing who to invite first: someone sending receipts for a
    // Nigerian fintech tests a different half of the product than a newsletter.
    if (contactId && (body.use_case || body.volume)) {
      const [existing] = await db
        .select({ metadata: contacts.metadata })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      await db
        .update(contacts)
        .set({
          metadata: {
            ...(existing?.metadata ?? {}),
            ...(body.use_case ? { beta_use_case: body.use_case } : {}),
            ...(body.volume ? { beta_volume: body.volume } : {}),
            beta_signed_up_at: new Date().toISOString(),
          },
        })
        .where(eq(contacts.id, contactId));
    }

    return reply.code(202).send({ ok: true, status: "waiting" });
  });

  /**
   * PUBLIC: "my Amazon confirmation link expired — send another".
   *
   * Answers first and works after, so neither the body nor the response time
   * says whether the address is on the list. All the deciding (on the waitlist?
   * link actually dead? our domain? a customer's sender?) is in
   * resendTesterConfirmation; this route only validates, rate-limits and hides.
   */
  app.post("/v1/beta/waitlist/resend-confirmation", async (req, reply) => {
    const body = parse(resendBody, req.body);
    if (body.website) return reply.code(202).send(RESEND_NEUTRAL);

    const email = body.email.trim().toLowerCase();
    const slot = await takeResendSlot(resendClientIp(req), email);
    if (!slot.ok) {
      // Which limit was hit is safe to say: both count every address, on the
      // list or not. The caller needs it to avoid blaming the wrong thing.
      throw new AppError(429, "rate_limited", "Too many requests for a new confirmation link. Try again later.", {
        scope: slot.scope,
      });
    }

    void track(resendTesterConfirmation(email))
      // The outcome, never the address: this runs for strangers' addresses too.
      .then((outcome) => req.log.info({ outcome }, "beta confirmation resend"))
      .catch((err) => req.log.error({ err }, "beta confirmation resend threw"));

    return reply.code(202).send(RESEND_NEUTRAL);
  });

  /**
   * PUBLIC: is the beta open, and is there room?
   *
   * Someone landing on rootmail.io today sees a Sign up button and reasonably
   * expects to sign up. They cannot — the door needs a code — and discovering
   * that at the end of a form is the worst possible way to learn it. So the
   * marketing site asks this and says so upfront.
   *
   * Deliberately coarse: seats left, not who has them. This is an unauthenticated
   * endpoint and the exact roster is nobody else's business.
   */
  app.get("/v1/beta/status", async (_req, reply) => {
    const seats = await autoAdmitRemaining();
    // Readable from a browser on any origin. This is the one endpoint that
    // needs it: the marketing site is statically generated, so the seat count
    // has to be fetched after the page loads rather than rendered into it.
    // Safe to open — no auth, no secrets, and the numbers are printed on a
    // public page anyway.
    reply.header("access-control-allow-origin", "*");
    return reply.send({
      // Whether an invite code is needed at all — one env var flips the whole
      // site's copy the day we open up.
      closed: betaInviteRequired(),
      seats_total: seats.limit,
      seats_left: seats.left,
      // The distinction that matters to a visitor: can I get in NOW, or am I
      // joining a queue for the next round?
      accepting: seats.left > 0,
    });
  });

  /**
   * Has this address already been let in? The /beta page asks on submit so
   * someone who already has a code is told to check their mail rather than
   * being left staring at a form they have already filled.
   *
   * Deliberately says nothing about addresses that are NOT on the list — that
   * would turn the endpoint into a way to test whether someone uses rootmail.
   */
  app.get("/v1/beta/waitlist/status", async (req, reply) => {
    const q = parse(z.object({ email: z.string().email() }), req.query);
    const { workspaceId } = await betaWaitlistAudience();
    const [row] = await db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.subTenantId),
          eq(contacts.email, q.email.toLowerCase()),
        ),
      )
      .limit(1);
    return reply.send({ invited: Boolean(row?.tags?.includes("beta-invited")) });
  });
}
