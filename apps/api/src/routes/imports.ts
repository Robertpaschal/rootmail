import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, newId, type SuppressionReason } from "@rootmail/core";
import { contacts, db, listContacts, lists, suppressions } from "@rootmail/db";
import { assertContactCapacity } from "../lib/billing";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

// Migration on-ramps: bulk-import a suppression list or contacts from a previous
// provider's export (SendGrid / Postmark / Mailgun). The dashboard maps each
// provider's CSV columns to these normalized entries. Imports are plain upserts —
// they deliberately do NOT fire contact_created/tagged sequence triggers, so you
// can't accidentally blast a welcome series at thousands of migrated contacts.

const MAX = 25_000;
const emailSchema = z.string().email();

/** Map a provider's freeform reason/type/status column to our enum. */
function normalizeReason(raw?: string): SuppressionReason {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("bounce") || r.includes("invalid") || r.includes("block")) return "bounce";
  if (r.includes("spam") || r.includes("complain") || r.includes("abuse")) return "complaint";
  if (r.includes("unsub")) return "unsubscribe";
  return "manual";
}

const suppressionBody = z.object({
  source: z.string().max(64).optional(),
  entries: z.array(z.object({ email: z.string(), reason: z.string().optional() })).min(1).max(MAX),
});

const contactsBody = z.object({
  list_id: z.string().optional(),
  entries: z
    .array(z.object({ email: z.string(), name: z.string().optional(), tags: z.array(z.string()).optional() }))
    .min(1)
    .max(MAX),
});

export async function importRoutes(app: FastifyInstance): Promise<void> {
  // --- Suppression list import -------------------------------------------
  app.post("/v1/imports/suppressions", async (req) => {
    await requirePermission(req, "content.manage");
    const body = parse(suppressionBody, req.body);
    const subTenantId = req.auth.subTenant?.id ?? null;

    const seen = new Set<string>();
    let invalid = 0;
    const rows: (typeof suppressions.$inferInsert)[] = [];
    for (const e of body.entries) {
      const email = e.email.trim().toLowerCase();
      if (!emailSchema.safeParse(email).success) {
        invalid++;
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      rows.push({
        id: newId("suppression"),
        workspaceId: req.auth.workspace.id,
        subTenantId,
        email,
        reason: normalizeReason(e.reason),
        source: body.source ?? "import",
      });
    }
    // onConflictDoNothing → returning tells us how many were actually new.
    const inserted = rows.length
      ? await db.insert(suppressions).values(rows).onConflictDoNothing().returning({ id: suppressions.id })
      : [];
    return {
      object: "import_result",
      kind: "suppressions",
      total: body.entries.length,
      imported: inserted.length,
      duplicates: rows.length - inserted.length,
      invalid,
    };
  });

  // --- Contacts import ----------------------------------------------------
  app.post("/v1/imports/contacts", async (req) => {
    await requirePermission(req, "content.manage");
    const body = parse(contactsBody, req.body);
    const subTenantId = req.auth.subTenant?.id ?? null;

    let listId: string | null = null;
    if (body.list_id) {
      const [l] = await db
        .select()
        .from(lists)
        .where(and(eq(lists.id, body.list_id), eq(lists.workspaceId, req.auth.workspace.id)))
        .limit(1);
      if (!l) throw Errors.notFound(`List ${body.list_id} not found`);
      listId = l.id;
    }

    // Normalize + dedupe valid entries.
    const byEmail = new Map<string, { name?: string; tags?: string[] }>();
    let invalid = 0;
    for (const e of body.entries) {
      const email = e.email.trim().toLowerCase();
      if (!emailSchema.safeParse(email).success) {
        invalid++;
        continue;
      }
      if (!byEmail.has(email)) byEmail.set(email, { name: e.name, tags: e.tags });
    }
    const emails = [...byEmail.keys()];

    // Which already exist (scoped to this workspace + sub-tenant)?
    const existing = emails.length
      ? await db
          .select({ id: contacts.id, email: contacts.email })
          .from(contacts)
          .where(
            and(
              eq(contacts.workspaceId, req.auth.workspace.id),
              subTenantId ? eq(contacts.subTenantId, subTenantId) : isNull(contacts.subTenantId),
              inArray(contacts.email, emails),
            ),
          )
      : [];
    const existingByEmail = new Map(existing.map((c) => [c.email, c.id]));

    // Insert the new ones in bulk.
    const toInsert = emails
      .filter((e) => !existingByEmail.has(e))
      .map((email) => ({
        id: newId("contact"),
        workspaceId: req.auth.workspace.id,
        subTenantId,
        email,
        name: byEmail.get(email)?.name ?? null,
        tags: byEmail.get(email)?.tags ?? [],
        status: "active" as const,
      }));
    const inserted = toInsert.length ? await db.insert(contacts).values(toInsert).returning({ id: contacts.id }) : [];

    // Optionally add everyone (new + existing) to the target list. Audience growth
    // is what the marketing wing prices — gate it on the contact bracket.
    let addedToList = 0;
    if (listId) {
      const allIds = [...existingByEmail.values(), ...inserted.map((c) => c.id)];
      if (allIds.length) {
        await assertContactCapacity(await loadOrg(req), allIds.length);
        const memberships = allIds.map((contactId) => ({ id: newId("listContact"), listId: listId as string, contactId }));
        const added = await db.insert(listContacts).values(memberships).onConflictDoNothing().returning({ id: listContacts.id });
        addedToList = added.length;
      }
    }

    return {
      object: "import_result",
      kind: "contacts",
      total: body.entries.length,
      imported: inserted.length,
      existing: existingByEmail.size,
      invalid,
      list_id: listId,
      added_to_list: addedToList,
    };
  });
}
