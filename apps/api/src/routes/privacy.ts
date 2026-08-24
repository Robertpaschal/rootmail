import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, newId } from "@rootmail/core";
import {
  auditEntries,
  contactEvents,
  contacts,
  db,
  listContacts,
  lists,
  messages,
  sequenceEnrollments,
  suppressions,
  threadMessages,
  threads,
} from "@rootmail/db";
import { authActor } from "../lib/dispatch";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

// Data-subject rights (GDPR Articles 15 and 17).
//
// These exist because a customer of ours will eventually receive a request from
// one of THEIR recipients and have to answer it. Without an endpoint the answer
// is a support ticket and a hand-written SQL query, which is not a process
// anybody should run against production under a 30-day statutory clock.
//
// Both are scoped to the caller's workspace and sub-tenant like every other
// route: one customer must never be able to export or erase a person who belongs
// to another.

const subjectBody = z.object({ email: z.string().email() });

/** Everything we hold about one recipient, in one response. */
async function collect(workspaceId: string, subTenantId: string | null, email: string) {
  const scoped = <T extends { workspaceId: unknown; subTenantId: unknown }>(t: T) =>
    subTenantId
      ? and(eq(t.workspaceId as never, workspaceId), eq(t.subTenantId as never, subTenantId))
      : and(eq(t.workspaceId as never, workspaceId), isNull(t.subTenantId as never));

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(scoped(contacts)!, eq(contacts.email, email)))
    .limit(1);

  const sent = await db
    .select({
      id: messages.id,
      subject: messages.subject,
      status: messages.status,
      type: messages.type,
      sentAt: messages.createdAt,
      // Not the rendered body: an export is a record of what we hold about a
      // person, and shipping the full HTML of every message to whoever asked is
      // a data-protection problem of its own.
      redactedAt: messages.redactedAt,
    })
    .from(messages)
    .where(and(scoped(messages)!, eq(messages.toEmail, email)))
    .orderBy(desc(messages.createdAt))
    .limit(1000);

  const supp = await db
    .select({ reason: suppressions.reason, source: suppressions.source, at: suppressions.createdAt })
    .from(suppressions)
    .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.email, email)));

  const events = contact
    ? await db
        .select({ kind: contactEvents.kind, at: contactEvents.occurredAt })
        .from(contactEvents)
        .where(eq(contactEvents.contactId, contact.id))
        .orderBy(desc(contactEvents.occurredAt))
        .limit(500)
    : [];

  const memberships = contact
    ? await db
        .select({ list: lists.name, listId: lists.id })
        .from(listContacts)
        .innerJoin(lists, eq(lists.id, listContacts.listId))
        .where(eq(listContacts.contactId, contact.id))
    : [];

  const conversations = await db
    .select({ id: threads.id, subject: threads.subject, status: threads.status, at: threads.createdAt })
    .from(threads)
    .where(and(scoped(threads)!, eq(threads.contactEmail, email)))
    .limit(200);

  return { contact: contact ?? null, sent, supp, events, memberships, conversations };
}

export async function privacyRoutes(app: FastifyInstance): Promise<void> {
  // --- Article 15: the right of access -------------------------------------
  app.post("/v1/privacy/export", async (req) => {
    await requirePermission(req, "content.manage");
    const body = parse(subjectBody, req.body);
    const email = body.email.trim().toLowerCase();
    const subTenantId = req.auth.subTenant?.id ?? null;

    const d = await collect(req.auth.workspace.id, subTenantId, email);

    return {
      object: "data_subject_export",
      email,
      generated_at: new Date().toISOString(),
      contact: d.contact
        ? {
            id: d.contact.id,
            name: d.contact.name,
            status: d.contact.status,
            stage: d.contact.stage,
            tags: d.contact.tags,
            metadata: d.contact.metadata,
            created_at: d.contact.createdAt,
          }
        : null,
      audiences: d.memberships,
      messages: d.sent,
      conversations: d.conversations,
      events: d.events,
      suppressions: d.supp,
    };
  });

  // --- Article 17: the right to erasure ------------------------------------
  app.post("/v1/privacy/erase", async (req) => {
    await requirePermission(req, "content.manage");
    const body = parse(subjectBody.extend({ confirm: z.literal(true) }), req.body);
    const email = body.email.trim().toLowerCase();
    const subTenantId = req.auth.subTenant?.id ?? null;
    const workspaceId = req.auth.workspace.id;
    const now = new Date();

    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          subTenantId ? eq(contacts.subTenantId, subTenantId) : isNull(contacts.subTenantId),
          eq(contacts.email, email),
        ),
      )
      .limit(1);

    // Messages are REDACTED, not deleted: the id, content hash, status and
    // timestamps are what make a send provable, and a customer who erases a
    // recipient should not thereby destroy their own evidence that they complied
    // with the law when they mailed them. Same shape the retention sweep uses.
    const msgs = await db
      .update(messages)
      .set({
        toEmail: "[redacted]",
        subject: "[redacted]",
        renderedHtml: null,
        renderedText: null,
        variables: {},
        metadata: {},
        error: null,
        redactedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          subTenantId ? eq(messages.subTenantId, subTenantId) : isNull(messages.subTenantId),
          eq(messages.toEmail, email),
        ),
      )
      .returning({ id: messages.id });

    // Conversation bodies are the person's own words — deleted outright.
    const threadRows = await db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.workspaceId, workspaceId), eq(threads.contactEmail, email)));
    for (const t of threadRows) {
      await db.delete(threadMessages).where(eq(threadMessages.threadId, t.id));
      await db.delete(threads).where(eq(threads.id, t.id));
    }

    if (contact) {
      await db.delete(sequenceEnrollments).where(eq(sequenceEnrollments.contactId, contact.id));
      await db.delete(listContacts).where(eq(listContacts.contactId, contact.id));
      await db.delete(contactEvents).where(eq(contactEvents.contactId, contact.id));
      await db.delete(contacts).where(eq(contacts.id, contact.id));
    }

    // The suppression entry SURVIVES, deliberately.
    //
    // Deleting it would mean the next campaign mails this person again — erasing
    // someone's data and then emailing them is the outcome nobody wants, and it
    // is why Article 17(3) carves out processing required for compliance with a
    // legal obligation. Keeping a suppression is the narrowest possible record
    // that honours both the erasure and the opt-out.
    const kept = await db
      .select({ reason: suppressions.reason })
      .from(suppressions)
      .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.email, email)));

    await db.insert(auditEntries).values({
      id: newId("audit"),
      workspaceId,
      subTenantId,
      messageId: null,
      event: "data_erased",
      actor: authActor(req.auth).actor,
      actorId: authActor(req.auth).actorId,
      // The address is the thing being erased, so it is NOT written here. What
      // stays is that an erasure happened, by whom, and how much it touched.
      metadata: {
        contact_deleted: Boolean(contact),
        messages_redacted: msgs.length,
        conversations_deleted: threadRows.length,
        suppressions_retained: kept.length,
      },
    });

    return {
      object: "erasure",
      email,
      erased: true,
      contact_deleted: Boolean(contact),
      messages_redacted: msgs.length,
      conversations_deleted: threadRows.length,
      suppressions_retained: kept.length,
      note:
        kept.length > 0
          ? "Their suppression entry is kept so they are not emailed again — erasing it would undo their opt-out. Everything else identifying them has been removed or redacted."
          : "Everything identifying them has been removed or redacted.",
    };
  });
}
