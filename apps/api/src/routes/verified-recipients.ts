import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, env, newId } from "@rootmail/core";
import { db, verifiedRecipients } from "@rootmail/db";
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
    const rows = await db
      .select()
      .from(verifiedRecipients)
      .where(eq(verifiedRecipients.workspaceId, req.auth.workspace.id))
      .orderBy(asc(verifiedRecipients.createdAt));

    // Refresh anything still pending: the person clicks a link in THEIR inbox
    // and nothing tells us, exactly like sub-tenant DNS. Ask on read.
    const out = [];
    for (const r of rows) {
      let status = r.status;
      if (status !== "verified" && (await isTesterVerified(r.email))) {
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
      required: env.SES_SANDBOX_MODE !== "false",
      data: out,
    };
  });

  app.post("/v1/testing/recipients", async (req) => {
    await requirePermission(req, "messages.send");
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
      return { object: "verified_recipient", ...updated, resent: true };
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
