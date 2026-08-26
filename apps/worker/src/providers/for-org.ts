import { eq } from "drizzle-orm";
import { decryptSecret, testRecipientFor } from "@rootmail/core";
import { db, organizations, orgSendingProviders, workspaces } from "@rootmail/db";
import { MailgunProvider, type MailgunCredentials } from "./mailgun";
import { SesProvider, type SesCredentials } from "./ses";
import { getProviderFor } from "./index";
import type { MailProvider } from "./types";

/**
 * Which account this message actually leaves from.
 *
 * If the organization has connected their own provider, it is theirs: their
 * credentials, their IPs, their reputation, their provider approval. Otherwise
 * it is the platform's.
 *
 * This is the difference between rootmail being an MTA and rootmail being the
 * layer above one. The buyer — a platform already sending on behalf of its own
 * customers — has a provider already; what they lack is per-client domains,
 * per-client reputation and isolation. Making them wait on OUR provider approval
 * to use that layer is a self-inflicted dependency, and it is currently blocking
 * a beta that has nothing to do with our sending account.
 *
 * Cached briefly: this runs on every send, and a customer's credentials do not
 * change between two messages in the same batch.
 */

interface Cached {
  at: number;
  provider: MailProvider | null;
}
const CACHE_MS = 60_000;
const cache = new Map<string, Cached>();

/** Forget an org's cached provider — called when they connect or disconnect one. */
export function forgetOrgProvider(organizationId: string): void {
  cache.delete(organizationId);
}

function build(provider: string, raw: string): MailProvider | null {
  const creds = JSON.parse(decryptSecret(raw)) as Record<string, string>;
  if (provider === "ses") {
    return new SesProvider(creds as unknown as SesCredentials);
  }
  if (provider === "mailgun") {
    return new MailgunProvider(creds as unknown as MailgunCredentials);
  }
  return null;
}

export async function providerForMessage(message: {
  workspaceId: string;
  sandbox: boolean;
  toEmail: string;
}): Promise<MailProvider> {
  // Sandbox mail never leaves, and a reserved test address must take the real
  // path — both decisions belong to the existing router, not to whose account
  // is paying. Resolve those first.
  if (message.sandbox && !testRecipientFor(message.toEmail)) {
    return getProviderFor(message.sandbox, message.toEmail);
  }

  const [row] = await db
    .select({ orgId: organizations.id })
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(eq(workspaces.id, message.workspaceId))
    .limit(1);
  if (!row) return getProviderFor(message.sandbox, message.toEmail);

  const hit = cache.get(row.orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.provider ?? getProviderFor(message.sandbox, message.toEmail);
  }

  const [conn] = await db
    .select()
    .from(orgSendingProviders)
    .where(eq(orgSendingProviders.organizationId, row.orgId))
    .limit(1);

  // Only an ACTIVE connection is used. A credential that failed its last check
  // would fail this send too, and falling back silently is better than failing
  // — the customer already has an error waiting for them on the settings page.
  let own: MailProvider | null = null;
  if (conn && conn.status === "active") {
    try {
      own = build(conn.provider, conn.credentials);
    } catch {
      // Undecryptable or malformed: treat as not connected rather than throwing
      // on a send. The connection page is where this gets reported.
      own = null;
    }
  }

  cache.set(row.orgId, { at: Date.now(), provider: own });
  return own ?? getProviderFor(message.sandbox, message.toEmail);
}
