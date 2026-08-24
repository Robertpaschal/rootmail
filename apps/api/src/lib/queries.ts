import { and, eq, isNull } from "drizzle-orm";
import { newId, type SuppressionReason,
  type MessageType,
} from "@rootmail/core";
import { contacts, db, suppressions, templates,
  isSuppressed as sharedIsSuppressed,
} from "@rootmail/db";

export async function findContact(workspaceId: string, subTenantId: string | null, email: string) {
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
  return contact ?? null;
}

/**
 * Is this recipient suppressed for a send of this KIND?
 *
 * The kind matters, and this used to ignore it. An `unsubscribe` is an opt-out
 * of bulk mail — it must never block a password reset or a receipt — and the
 * worker's `suppressionBlocks` has always known that, while this copy blocked
 * everything. So a customer who unsubscribed from a newsletter was silently
 * locked out of their own account recovery, and the API and the worker disagreed
 * about the same list. It is also the rule we now publish in our Acceptable Use
 * Policy, which makes the divergence a claim as well as a bug.
 *
 * Delegates to the shared rule rather than restating it, because two
 * implementations of "who may we email" is how they drifted in the first place.
 */
export async function isSuppressed(
  workspaceId: string,
  subTenantId: string | null,
  email: string,
  // Defaults to marketing — the STRICTER reading. A caller that forgets to say
  // what it is sending gets the conservative answer, never the permissive one.
  type: MessageType = "marketing",
): Promise<boolean> {
  const rows = await db
    .select({ subTenantId: suppressions.subTenantId, reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.email, email)));
  return sharedIsSuppressed(rows, { type, subTenantId });
}

export async function addSuppression(
  workspaceId: string,
  subTenantId: string | null,
  email: string,
  reason: SuppressionReason,
  messageId: string | null = null,
  source = "system",
): Promise<void> {
  await db
    .insert(suppressions)
    .values({
      id: newId("suppression"),
      workspaceId,
      subTenantId: subTenantId ?? null,
      email,
      reason,
      source,
      messageId,
    })
    .onConflictDoNothing();
}

/** Resolve a template by slug or id, preferring a sub-tenant override over the workspace default. */
export async function loadTemplate(
  workspaceId: string,
  subTenantId: string | null,
  ref: { slug?: string; id?: string },
) {
  const conditions = [eq(templates.workspaceId, workspaceId)];
  if (ref.id) conditions.push(eq(templates.id, ref.id));
  else if (ref.slug) conditions.push(eq(templates.slug, ref.slug));

  const rows = await db
    .select()
    .from(templates)
    .where(and(...conditions));
  if (rows.length === 0) return null;

  return (
    rows.find((r) => r.subTenantId === subTenantId) ??
    rows.find((r) => r.subTenantId === null) ??
    rows[0]
  );
}
