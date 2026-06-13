import { and, eq, isNull } from "drizzle-orm";
import { newId, type SuppressionReason } from "@rootmail/core";
import { contacts, db, suppressions, templates } from "@rootmail/db";

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
 * A recipient is suppressed if there's a workspace-global suppression (null
 * sub-tenant) OR one scoped to the sub-tenant the send is going through.
 */
export async function isSuppressed(
  workspaceId: string,
  subTenantId: string | null,
  email: string,
): Promise<boolean> {
  const rows = await db
    .select({ subTenantId: suppressions.subTenantId })
    .from(suppressions)
    .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.email, email)));
  return rows.some((r) => r.subTenantId === null || r.subTenantId === subTenantId);
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
