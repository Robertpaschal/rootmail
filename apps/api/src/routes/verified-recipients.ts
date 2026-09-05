import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, newId } from "@rootmail/core";
import { db, verifiedRecipients, sendingAccess } from "@rootmail/db";
import { loadOrg } from "../lib/features";
import { seedBetaTestKit } from "../lib/beta-test-kit";
import { requirePermission } from "../lib/permissions";
import { ensureTesterIdentity, isTesterVerified } from "../lib/ses-provisioning";
import { parse } from "../lib/validate";

// Who a customer may email while our sending account is provider-limited.
//
// Until the account leaves the provider's sandbox, mail to an unverified address
// is refused BY THE PROVIDER, with the provider's wording, halfway through a
// send. That is a bad way to learn a rule, and it makes the product look broken
// when it is doing exactly what it was told.
//
// So the constraint becomes part of the product: nominate the people you want to
// test with, they get one confirmation email, and the dashboard shows who is
// ready. A closed beta run this way exercises everything except volume.

const addBody = z.object({
  email: z.string().email(),
  label: z.string().max(80).optional(),
});

export async function verifiedRecipientRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/testing/recipients", async (req) => {
    const access = await sendingAccess(req.auth.workspace.id);
    const rows = await db
      .select()
      .from(verifiedRecipients)
      .where(eq(verifiedRecipients.workspaceId, req.auth.workspace.id))
      .orderBy(asc(verifiedRecipients.createdAt));

    // Refresh anything still pending: the person clicks a link in THEIR inbox
    // and nothing tells us, exactly like sub-tenant DNS. Ask on read.
    const out = [];
    let verificationUnavailable = false;
    for (const r of rows) {
      let status = r.status;
      let confirmed = false;
      if (access.required && status !== "verified") {
        try { confirmed = await isTesterVerified(r.email, { throwOnUnavailable: true }); }
        catch { verificationUnavailable = true; }
      }
      if (confirmed) {
        status = "verified";
        await db
          .update(verifiedRecipients)
          .set({ status, verifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(verifiedRecipients.id, r.id));
      }
      out.push({
        id: r.id,
        email: r.email,
        label: r.label,
        status,
        verified_at: status === "verified" ? (r.verifiedAt ?? new Date()) : null,
      });
    }

    return {
      object: "list",
      // Says WHY this list exists, so the dashboard never has to invent the
      // explanation and can never contradict the API.
      ...access,
      verification_unavailable: verificationUnavailable,
      data: out,
    };
  });

  app.post("/v1/testing/recipients", async (req) => {
    await requirePermission(req, "messages.send");
    const access = await sendingAccess(req.auth.workspace.id);
    if (!access.required) throw Errors.badRequest("Recipient verification is not required for this workspace's sending route.");
    const body = parse(addBody, req.body);
    const email = body.email.trim().toLowerCase();

    const [existing] = await db
      .select()
      .from(verifiedRecipients)
      .where(
        and(
          eq(verifiedRecipients.workspaceId, req.auth.workspace.id),
          eq(verifiedRecipients.email, email),
        ),
      )
      .limit(1);

    // Asking the provider again would send a duplicate confirmation to someone
    // who already has one sitting in their inbox.
    const result = await ensureTesterIdentity(email);
    if (!result.ok) {
      throw Errors.badRequest(`Couldn't start verification for ${email}: ${result.reason}`);
    }
    const status = result.value.status === "verified" ? "verified" : "pending";

    if (existing) {
      const [updated] = await db
        .update(verifiedRecipients)
        .set({
          status,
          label: body.label ?? existing.label,
          verifiedAt: status === "verified" ? (existing.verifiedAt ?? new Date()) : null,
          updatedAt: new Date(),
        })
        .where(eq(verifiedRecipients.id, existing.id))
        .returning();
      return { object: "verified_recipient", ...updated };
    }

    const [row] = await db
      .insert(verifiedRecipients)
      .values({
        id: newId("verifiedRecipient"),
        workspaceId: req.auth.workspace.id,
        email,
        label: body.label ?? null,
        status,
        verifiedAt: status === "verified" ? new Date() : null,
      })
      .returning();

    return {
      object: "verified_recipient",
      ...row,
      note:
        status === "verified"
          ? "Already confirmed — you can send to them now."
          : `We've asked ${email} to confirm. They'll get one email from our sending provider; once they click the link you can send to them.`,
    };
  });

  // Explicit repair for older beta workspaces. Does not send verification mail,
  // reset an opt-out, or delete a contact's history.
  app.post("/v1/testing/beta-kit", async (req) => {
    await requirePermission(req, "content.manage");
    const org = await loadOrg(req);
    if (!org.isBeta || req.auth.workspace.environment !== "live" || req.auth.subTenant || !req.auth.user) {
      throw Errors.badRequest("Prepare the beta audience in your live workspace, outside a client view.");
    }
    const result = await seedBetaTestKit(req.auth.workspace.id, req.auth.user.email);
    return { list_id: result.listId, added: result.added };
  });

  app.delete("/v1/testing/recipients/:id", async (req) => {
    await requirePermission(req, "messages.send");
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(verifiedRecipients)
      .where(
        and(eq(verifiedRecipients.id, id), eq(verifiedRecipients.workspaceId, req.auth.workspace.id)),
      )
      .limit(1);
    if (!row) throw Errors.notFound("Not found");
    // Only our record goes. The provider identity is account-wide and may belong
    // to someone else's list too — removing it would break their sending.
    await db.delete(verifiedRecipients).where(eq(verifiedRecipients.id, row.id));
    return { object: "verified_recipient", id: row.id, deleted: true };
  });
}
