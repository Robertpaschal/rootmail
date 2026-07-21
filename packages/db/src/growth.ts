import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db } from "./client";
import {
  contactEvents,
  contacts,
  listContacts,
  lists,
  orgAddons,
  workspaces,
} from "./schema";
import { evaluateTriggers } from "./sequence-triggers";

// Audience growth — the shared machinery behind public signups, imports, and the
// waitlist. Lives in @rootmail/db so the API (subscribe routes) and the worker
// (waitlist admission) admit people through EXACTLY the same door: capacity check
// → contact upsert → audience membership → lifecycle event → sequence triggers.

export type ContactEventKind =
  | "subscribed"
  | "confirmed"
  | "unsubscribed"
  | "imported"
  | "waitlisted"
  | "admitted"
  | "stage_changed";

export async function emitContactEvent(e: {
  workspaceId: string;
  subTenantId?: string | null;
  contactId?: string | null;
  listId?: string | null;
  email: string;
  kind: ContactEventKind;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(contactEvents).values({
    id: newId("contactEvent"),
    workspaceId: e.workspaceId,
    subTenantId: e.subTenantId ?? null,
    contactId: e.contactId ?? null,
    listId: e.listId ?? null,
    email: e.email.toLowerCase(),
    kind: e.kind,
    metadata: e.metadata ?? {},
  });
}

/** Contacts that count toward the org's marketing capacity (audience memberships). */
export async function billableContactCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(listContacts)
    .innerJoin(lists, eq(lists.id, listContacts.listId))
    .innerJoin(workspaces, eq(workspaces.id, lists.workspaceId))
    .where(eq(workspaces.organizationId, organizationId));
  return row?.n ?? 0;
}

/** Purchased contact_pack add-on units (each = CONTACT_PACK_SIZE more contacts). */
/** Purchased quantity of a given pack add-on for an org (0 if none). */
export async function addonPackUnits(organizationId: string, addonId: string): Promise<number> {
  const [row] = await db
    .select({ q: orgAddons.quantity })
    .from(orgAddons)
    .where(and(eq(orgAddons.organizationId, organizationId), eq(orgAddons.addonId, addonId)))
    .limit(1);
  return row?.q ?? 0;
}

export async function contactPackUnits(organizationId: string): Promise<number> {
  return addonPackUnits(organizationId, "contact_pack");
}

export interface AdmitInput {
  workspaceId: string;
  subTenantId: string | null;
  list: { id: string; signupTag: string | null };
  email: string;
  name?: string | null;
  /** Where the signup came from — recorded on the event. */
  source: "form" | "api" | "import" | "waitlist";
  /** True when this admission followed a double opt-in confirmation. */
  confirmed?: boolean;
  /** Contact slots the org still has (Infinity when unlimited). */
  capacityRemaining: number;
}

export type AdmitResult =
  | { state: "subscribed"; contactId: string; created: boolean }
  | { state: "waitlisted" };

/**
 * Admit one subscriber into an audience — or waitlist them when the org is out
 * of contact room, so a signup is never lost to a paywall. Handles resubscribes
 * (an unsubscribed contact who signs up again goes active), applies the
 * audience's signup tag, and fires sequence triggers (welcome automations).
 */
export async function admitSubscriber(input: AdmitInput): Promise<AdmitResult> {
  const email = input.email.trim().toLowerCase();
  const scope = input.subTenantId ? eq(contacts.subTenantId, input.subTenantId) : isNull(contacts.subTenantId);

  const [existing] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, input.workspaceId), scope, eq(contacts.email, email)))
    .limit(1);

  const [membership] = existing
    ? await db
        .select({ id: listContacts.id })
        .from(listContacts)
        .where(and(eq(listContacts.listId, input.list.id), eq(listContacts.contactId, existing.id)))
        .limit(1)
    : [undefined];

  // Already an active member — nothing to add, nothing to bill. Idempotent.
  if (existing && membership && existing.status === "active") {
    return { state: "subscribed", contactId: existing.id, created: false };
  }

  // A new membership consumes one contact slot; out of room → the waitlist keeps
  // the signup (email + name) until capacity frees, instead of dropping it.
  if (!membership && input.capacityRemaining < 1) {
    await emitContactEvent({
      workspaceId: input.workspaceId,
      subTenantId: input.subTenantId,
      listId: input.list.id,
      email,
      kind: "waitlisted",
      metadata: { name: input.name ?? null, source: input.source },
    });
    return { state: "waitlisted" };
  }

  const tag = input.list.signupTag?.trim() || null;
  let contactId: string;
  let created = false;
  let resubscribed = false;
  let tags: string[];

  if (!existing) {
    contactId = newId("contact");
    tags = tag ? [tag] : [];
    await db.insert(contacts).values({
      id: contactId,
      workspaceId: input.workspaceId,
      subTenantId: input.subTenantId,
      email,
      name: input.name?.trim() || null,
      tags,
      status: "active",
    });
    created = true;
  } else {
    contactId = existing.id;
    tags = existing.tags ?? [];
    if (tag && !tags.includes(tag)) tags = [...tags, tag];
    resubscribed = existing.status !== "active";
    await db
      .update(contacts)
      .set({
        // An explicit signup is consent — an unsubscribed contact goes active again.
        status: "active",
        name: existing.name ?? (input.name?.trim() || null),
        tags,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id));
  }

  if (!membership) {
    await db
      .insert(listContacts)
      .values({ id: newId("listContact"), listId: input.list.id, contactId })
      .onConflictDoNothing();
  }

  await emitContactEvent({
    workspaceId: input.workspaceId,
    subTenantId: input.subTenantId,
    contactId,
    listId: input.list.id,
    email,
    kind: "subscribed",
    metadata: {
      source: input.source,
      ...(input.confirmed ? { confirmed: true } : {}),
      ...(resubscribed ? { resubscribed: true } : {}),
    },
  });

  // Welcome automations: contact_created fires for brand-new contacts; the signup
  // tag drives contact_tagged sequences either way.
  await evaluateTriggers(input.workspaceId, input.subTenantId, { id: contactId, email, tags }, { created });

  return { state: "subscribed", contactId, created };
}

export interface PendingWaitlistRow {
  workspaceId: string;
  subTenantId: string | null;
  listId: string;
  email: string;
  name: string | null;
  firstWaitlistedAt: Date;
}

/**
 * Signups still waiting for room, oldest first — waitlisted events with no
 * admitted event after them for the same (workspace, list, email).
 */
export async function pendingWaitlist(organizationId: string, limit = 200): Promise<PendingWaitlistRow[]> {
  const rows = await db
    .select({
      workspaceId: contactEvents.workspaceId,
      subTenantId: contactEvents.subTenantId,
      listId: contactEvents.listId,
      email: contactEvents.email,
      metadata: contactEvents.metadata,
      occurredAt: contactEvents.occurredAt,
    })
    .from(contactEvents)
    .innerJoin(workspaces, eq(workspaces.id, contactEvents.workspaceId))
    .where(
      and(
        eq(workspaces.organizationId, organizationId),
        eq(contactEvents.kind, "waitlisted"),
        sql`not exists (
          select 1 from ${contactEvents} a
          where a.kind = 'admitted'
            and a.workspace_id = ${contactEvents.workspaceId}
            and a.email = ${contactEvents.email}
            and a.list_id is not distinct from ${contactEvents.listId}
            and a.occurred_at >= ${contactEvents.occurredAt}
        )`,
      ),
    )
    .orderBy(asc(contactEvents.occurredAt))
    .limit(limit * 3);

  // Oldest event per (workspace, list, email); a repeat signup while waitlisted
  // must not queue twice.
  const seen = new Set<string>();
  const out: PendingWaitlistRow[] = [];
  for (const r of rows) {
    if (!r.listId) continue;
    const key = `${r.workspaceId}:${r.listId}:${r.email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      workspaceId: r.workspaceId,
      subTenantId: r.subTenantId,
      listId: r.listId,
      email: r.email,
      name: typeof r.metadata?.name === "string" ? r.metadata.name : null,
      firstWaitlistedAt: r.occurredAt,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Admit as many waitlisted signups as `capacity` allows, oldest first. Each
 * admission emits an `admitted` event (which is what removes it from the
 * pending queue) and runs the normal admission door — tag, triggers, and all.
 * Returns how many people got in.
 */
export async function admitWaitlisted(organizationId: string, capacity: number): Promise<number> {
  if (capacity < 1) return 0;
  const pending = await pendingWaitlist(organizationId, Math.min(capacity, 500));
  let admitted = 0;

  for (const p of pending) {
    if (admitted >= capacity) break;
    const [list] = await db
      .select({ id: lists.id, signupTag: lists.signupTag })
      .from(lists)
      .where(eq(lists.id, p.listId))
      .limit(1);
    if (!list) {
      // The audience is gone — retire the queue entry so it stops re-scanning.
      await emitContactEvent({
        workspaceId: p.workspaceId,
        subTenantId: p.subTenantId,
        listId: p.listId,
        email: p.email,
        kind: "admitted",
        metadata: { skipped: "list_deleted" },
      });
      continue;
    }

    const res = await admitSubscriber({
      workspaceId: p.workspaceId,
      subTenantId: p.subTenantId,
      list,
      email: p.email,
      name: p.name,
      source: "waitlist",
      capacityRemaining: capacity - admitted,
    });
    if (res.state === "subscribed") {
      await emitContactEvent({
        workspaceId: p.workspaceId,
        subTenantId: p.subTenantId,
        contactId: res.contactId,
        listId: p.listId,
        email: p.email,
        kind: "admitted",
        metadata: { waited_since: p.firstWaitlistedAt.toISOString() },
      });
      admitted += 1;
    } else {
      break; // still no room — stop scanning
    }
  }
  return admitted;
}
