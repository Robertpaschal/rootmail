import { eq } from "drizzle-orm";
import { env } from "@rootmail/core";
import { db, organizations, workspaces } from "@rootmail/db";

/**
 * Rootmail's OWN mail — what rootmail-hq (the internal org) sends to people:
 * system mail (welcome, verification, receipts, staff invites…) and the
 * internal org's transactional and sequence sends (the beta invite automation).
 *
 * By default it is tracked (opens and clicks) like all other mail, through the
 * shared SES_CONFIGURATION_SET, and its HTML is sent exactly as stored.
 * Only when SES_PLATFORM_CONFIGURATION_SET is set does this mail opt out:
 *  - that set replaces the shared one (it must publish the same
 *    bounce/complaint destinations), and
 *  - every <a> gets `ses:no-track`, so SES leaves the link alone.
 * Unset: neither happens. Never "no set".
 * Internal-org CAMPAIGNS and marketing API sends are not platform mail here: they
 * keep tracking, like a customer's.
 */

/** Adds `ses:no-track` to every anchor tag that doesn't carry it. `<abbr>`,
 * `<area>`, `<audio>`, `<aside>` are not anchors and are left alone. */
export function addSesNoTrack(html: string): string {
  return html.replace(/<a(?=[\s>/])([^>]*)>/gi, (tag, attrs: string) =>
    /(^|\s)ses:no-track(\s|=|\/|$)/i.test(attrs) ? tag : `<a ses:no-track${attrs}>`,
  );
}

/** The configuration set for platform mail: the override when set, else null so
 * the provider falls back to SES_CONFIGURATION_SET as it always has. */
export function platformConfigurationSet(): string | null {
  return env.SES_PLATFORM_CONFIGURATION_SET?.trim() || null;
}

/** Is this queued message rootmail-hq's own system, invite or transactional mail? */
export function isPlatformMessage(
  m: { type: string; campaignId: string | null; sequenceId: string | null },
  internalWorkspace: boolean,
): boolean {
  if (!internalWorkspace || m.campaignId) return false;
  return m.type === "transactional" || m.sequenceId != null;
}

// The internal org's workspace ids never change once created; cache them, but
// only once found (the worker may boot before the API creates the account).
let internalWorkspaceIds: Set<string> | null = null;
export async function isInternalWorkspace(workspaceId: string): Promise<boolean> {
  if (!internalWorkspaceIds) {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
      .where(eq(organizations.isInternal, true));
    if (rows.length === 0) return false;
    internalWorkspaceIds = new Set(rows.map((r) => r.id));
  }
  return internalWorkspaceIds.has(workspaceId);
}
/** Tests only. */
export function resetInternalWorkspaceCache(): void { internalWorkspaceIds = null; }
