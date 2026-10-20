import { eq } from "drizzle-orm";
import { byoEffective, byoGloballyEnabled, decideProviderRoute, openCredentials, testRecipientFor } from "@rootmail/core";
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
 * rootmail's own org (platform/system mail) ALWAYS leaves from ours — decided
 * explicitly in decideProviderRoute, not by the absence of a connection.
 *
 * A connection that cannot be used:
 *  - unflagged org: falls back to ours, exactly as before;
 *  - BYO-flagged org: throws ByoProviderUnavailable, and the pipeline fails the
 *    message with the reason. Never a silent fallback onto our sandboxed SES.
 *
 * Cached briefly: this runs on every send. The API announces connect / replace /
 * disconnect on Redis (see subscribeToProviderChanges), so a changed credential
 * takes effect on the next send instead of up to 60s later.
 */

export class ByoProviderUnavailable extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
    readonly organizationId: string,
  ) {
    super(reason);
    this.name = "ByoProviderUnavailable";
  }
}

/** What the pipeline needs to know about the chosen account beyond the provider itself. */
export interface ResolvedProvider {
  provider: MailProvider;
  /** Set when mail goes through a BYO-flagged tenant's own account. */
  byo: null | {
    organizationId: string;
    providerName: string;
    sendingDomains: string[];
  };
}

interface Cached {
  at: number;
  resolved: ResolvedProvider | null;
  failure: ByoProviderUnavailable | null;
}
const CACHE_MS = 60_000;
const cache = new Map<string, Cached>();

/** Forget an org's cached provider — called when they connect, replace or disconnect one. */
export function forgetOrgProvider(organizationId: string): void {
  cache.delete(organizationId);
}

function build(provider: string, raw: string, configurationSet: string | null): MailProvider | null {
  const creds = JSON.parse(openCredentials(raw)) as Record<string, string>;
  if (provider === "ses") {
    // Only the tenant's own configuration set — never ours (see sesConfigurationSetFor).
    return new SesProvider({ ...(creds as unknown as SesCredentials), configurationSet });
  }
  if (provider === "mailgun") {
    return new MailgunProvider(creds as unknown as MailgunCredentials);
  }
  return null;
}

/** The pre-existing signature, kept for callers that only want the provider. */
export async function providerForMessage(message: {
  workspaceId: string;
  sandbox: boolean;
  toEmail: string;
}): Promise<MailProvider> {
  return (await resolveProviderForMessage(message)).provider;
}

export async function resolveProviderForMessage(message: {
  workspaceId: string;
  sandbox: boolean;
  toEmail: string;
}): Promise<ResolvedProvider> {
  const ours = (): ResolvedProvider => ({ provider: getProviderFor(message.sandbox, message.toEmail), byo: null });

  // Sandbox mail never leaves, and a reserved test address must take the real
  // path — both decisions belong to the existing router, not to whose account
  // is paying. Resolve those first.
  if (message.sandbox && !testRecipientFor(message.toEmail)) return ours();

  const [row] = await db
    .select({ orgId: organizations.id, isInternal: organizations.isInternal, byoFlag: organizations.byoProvider })
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(eq(workspaces.id, message.workspaceId))
    .limit(1);
  if (!row) return ours();

  const hit = cache.get(row.orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (hit.failure) throw hit.failure;
    return hit.resolved ?? ours();
  }

  const flagged = byoEffective(row.byoFlag, byoGloballyEnabled());

  // Platform mail: decided before any connection lookup, so a stray row on the
  // internal org could never move our own mail onto a tenant account.
  if (row.isInternal) {
    cache.set(row.orgId, { at: Date.now(), resolved: null, failure: null });
    return ours();
  }

  const [conn] = await db
    .select()
    .from(orgSendingProviders)
    .where(eq(orgSendingProviders.organizationId, row.orgId))
    .limit(1);

  let own: MailProvider | null = null;
  let buildError: string | null = null;
  if (conn && conn.status === "active") {
    try {
      own = build(conn.provider, conn.credentials, conn.configurationSet ?? null);
      if (!own) buildError = `"${conn.provider}" is not a provider Rootmail can send through`;
    } catch {
      // Undecryptable or malformed. The message never includes the value.
      own = null;
      buildError = "the stored credentials could not be read; reconnect the account";
    }
  }

  const route = decideProviderRoute({
    isInternal: row.isInternal,
    flagged,
    connection: conn ? { status: conn.status } : null,
    buildError,
  });

  if (route.kind === "fail") {
    const failure = new ByoProviderUnavailable(conn?.provider ?? "provider", route.reason, row.orgId);
    cache.set(row.orgId, { at: Date.now(), resolved: null, failure });
    throw failure;
  }
  if (route.kind === "own" && own) {
    const resolved: ResolvedProvider = {
      provider: own,
      byo: flagged
        ? { organizationId: row.orgId, providerName: conn!.provider, sendingDomains: conn!.sendingDomains ?? (conn!.sendingDomain ? [conn!.sendingDomain] : []) }
        : null,
    };
    cache.set(row.orgId, { at: Date.now(), resolved, failure: null });
    return resolved;
  }
  cache.set(row.orgId, { at: Date.now(), resolved: null, failure: null });
  return ours();
}
