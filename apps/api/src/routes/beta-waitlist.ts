import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { admitSubscriber, contacts, db } from "@rootmail/db";
import { autoMintInvite, betaWaitlistAudience } from "../lib/beta-waitlist";
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
    void ensureTesterIdentity(body.email).catch(() => undefined);

    // Mint BEFORE admitting. admitSubscriber writes the contact and then fires
    // trigger evaluation, so a code handed over here is already on the record
    // when the welcome sequence enrolls them — and the sequence renders it as
    // {{beta_invite_code}} like any other custom field. No bespoke send path:
    // the automation every customer builds is the one that mails our invites.
    const code = await autoMintInvite(body.email);

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
        ...(code ? { beta_invite_code: code, beta_invited_at: new Date().toISOString() } : {}),
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
