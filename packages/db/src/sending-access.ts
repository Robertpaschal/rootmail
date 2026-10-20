import { and, eq } from "drizzle-orm";
import { byoEffective, byoGloballyEnabled, env, testRecipientFor } from "@rootmail/core";
import { db } from "./client";
import { organizations, orgSendingProviders, verifiedRecipients, workspaces } from "./schema";

/** One policy for the dashboard, API admission and queued campaign/sequence mail. */
export async function sendingAccess(workspaceId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found");
  const [own] = await db.select({ provider: orgSendingProviders.provider }).from(orgSendingProviders)
    .where(and(eq(orgSendingProviders.organizationId, workspace.organizationId), eq(orgSendingProviders.status, "active"))).limit(1);
  return {
    required: workspace.environment === "live" && !own && env.MAIL_PROVIDER === "ses" && env.SES_SANDBOX_MODE !== "false",
    sandbox: workspace.environment === "test",
    provider: own?.provider ?? env.MAIL_PROVIDER,
    own_provider: Boolean(own),
  };
}

/** Return only addresses that would be refused; never silently trim an audience. */
export async function unverifiedSendRecipients(workspaceId: string, emails: string[]): Promise<string[]> {
  if (!(await sendingAccess(workspaceId)).required) return [];
  const verified = await db.select({ email: verifiedRecipients.email }).from(verifiedRecipients)
    .where(and(eq(verifiedRecipients.workspaceId, workspaceId), eq(verifiedRecipients.status, "verified")));
  const ready = new Set(verified.map(r => r.email));
  return [...new Set(emails.map(email => email.trim().toLowerCase()))]
    .filter(email => !testRecipientFor(email) && !ready.has(email));
}

export const RECIPIENT_VERIFICATION_REQUIRED =
  "Rootmail's sending account is still in the SES sandbox. Confirm these test inboxes under Testing & sandbox → Test inboxes before sending. You can also use the delivery scenarios or connect your own approved provider in Settings → Sending.";

/**
 * The org's BYO state, for the paths that only exist behind the flag.
 * With BYO_PROVIDER_ENABLED off this returns { flagged: false } WITHOUT a
 * query, so unflagged callers do no extra work and behave exactly as before.
 */
export async function byoStateForOrg(organizationId: string): Promise<{
  flagged: boolean;
  connection: typeof orgSendingProviders.$inferSelect | null;
}> {
  if (!byoGloballyEnabled()) return { flagged: false, connection: null };
  const [org] = await db.select({ flag: organizations.byoProvider }).from(organizations)
    .where(eq(organizations.id, organizationId)).limit(1);
  if (!byoEffective(org?.flag)) return { flagged: false, connection: null };
  const [connection] = await db.select().from(orgSendingProviders)
    .where(eq(orgSendingProviders.organizationId, organizationId)).limit(1);
  return { flagged: true, connection: connection ?? null };
}

/** True when the org is flagged AND its own provider is active — the condition that lifts the beta daily cap. */
export async function byoActiveForOrg(organizationId: string): Promise<boolean> {
  const s = await byoStateForOrg(organizationId);
  return s.flagged && s.connection?.status === "active";
}
