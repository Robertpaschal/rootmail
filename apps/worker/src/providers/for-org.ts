import { eq } from "drizzle-orm";
import { byoEffective, byoGloballyEnabled, decideProviderRoute, openCredentials, testRecipientFor } from "@rootmail/core";
import { db, organizations, orgSendingProviders, workspaces } from "@rootmail/db";
import { MailgunProvider, type MailgunCredentials } from "./mailgun";
import { SesProvider, type SesCredentials } from "./ses";
import { SmtpProvider } from "./smtp";
import { getProviderFor } from "./index";
import { assumeRoleAvailable, awsAssume, ROLE_HINT_PREFIX, ASSUME_ROLE_REFRESH_MS, type AssumedCredentials } from "@rootmail/core/aws-assume";
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
  /** The flag state the entry was resolved under; a flip invalidates it at once. */
  flagged: boolean;
  resolved: ResolvedProvider | null;
  failure: ByoProviderUnavailable | null;
}
const CACHE_MS = 60_000;
const cache = new Map<string, Cached>();
/** Bumped on every invalidation, so a resolve that started before it never re-caches stale credentials. */
const generation = new Map<string, number>();

/** Forget an org's cached provider — called when they connect, replace or disconnect one. */
export function forgetOrgProvider(organizationId: string): void {
  cache.delete(organizationId);
  roleCreds.delete(organizationId);
  generation.set(organizationId, (generation.get(organizationId) ?? 0) + 1);
}

function remember(orgId: string, gen: number, entry: Omit<Cached, "at">): void {
  if ((generation.get(orgId) ?? 0) === gen) cache.set(orgId, { at: Date.now(), ...entry });
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** A deliberate refusal with a message written for the tenant (never contains a credential). */
class ByoConnectionUnusable extends Error {}

/** SMTP, or SES through an IAM role: kinds that only exist while BYO is on for the org. */
function isByoOnlyConnection(provider: string, raw: string, hint: string | null): boolean {
  if (provider === "smtp") return true;
  if (provider !== "ses") return false;
  // The plaintext hint marks a role connection even when the sealed payload
  // can't be opened, so an unreadable role row still fails closed.
  if (hint?.startsWith(ROLE_HINT_PREFIX)) return true;
  try {
    return (JSON.parse(openCredentials(raw)) as Record<string, unknown>).roleArn !== undefined;
  } catch {
    return false; // unreadable: handled exactly as before
  }
}

/**
 * Assume-role credentials per org, refreshed ASSUME_ROLE_REFRESH_MS before they
 * expire. Cleared by forgetOrgProvider, and an assume that started before a
 * provider change is never stored (the same generation counter as above).
 */
const roleCreds = new Map<string, { gen: number; roleArn: string; externalId: string; creds: AssumedCredentials }>();

/**
 * Bound to the generation the provider was BUILT under and to its role +
 * ExternalId: a stale provider still in flight after a replace can neither use
 * nor store credentials for the new connection.
 */
function roleCredentialProvider(orgId: string, roleArn: string, externalId: string) {
  const builtGen = generation.get(orgId) ?? 0;
  return async (): Promise<AssumedCredentials> => {
    const current = () => (generation.get(orgId) ?? 0) === builtGen;
    const hit = roleCreds.get(orgId);
    if (current() && hit && hit.gen === builtGen && hit.roleArn === roleArn && hit.externalId === externalId
      && hit.creds.expiration.getTime() - Date.now() > ASSUME_ROLE_REFRESH_MS) return hit.creds;
    const creds = await awsAssume.assumeTenantRole({ orgId, roleArn, externalId });
    if (current()) roleCreds.set(orgId, { gen: builtGen, roleArn, externalId, creds });
    return creds;
  };
}

function build(orgId: string, provider: string, raw: string, configurationSet: string | null, strict: boolean): MailProvider | null {
  const creds = JSON.parse(openCredentials(raw)) as Record<string, unknown>;
  if (provider === "ses" && creds.roleArn !== undefined) {
    // BYO assume-role. Only ever stored for a flagged org, and always
    // validated: without the assumer role there is no way to reach their account.
    if (!(str(creds.roleArn) && str(creds.externalId))) throw new ByoConnectionUnusable("the IAM role connection is incomplete; reconnect it");
    if (!assumeRoleAvailable()) throw new ByoConnectionUnusable("sending through an IAM role isn't available on this server right now");
    return new SesProvider({
      credentialProvider: roleCredentialProvider(orgId, creds.roleArn, creds.externalId),
      region: str(creds.region) ? creds.region : undefined,
      configurationSet,
    });
  }
  // Flagged orgs: validate before constructing — a provider built from `{}`
  // would quietly fall back to OUR env credentials inside the provider class.
  // (Unflagged orgs keep exactly the previous construction.)
  if (strict && provider === "ses" && !(str(creds.accessKeyId) && str(creds.secretAccessKey))) {
    throw new Error("incomplete SES credentials");
  }
  if (strict && provider === "mailgun" && !(str(creds.apiKey) && str(creds.domain))) {
    throw new Error("incomplete Mailgun credentials");
  }
  if (provider === "smtp") {
    // BYO-only (the API never stores SMTP for an unflagged org), and always
    // validated: there is no platform SMTP to fall back on.
    if (!(str(creds.host) && typeof creds.port === "number" && str(creds.username) && str(creds.password))) {
      throw new Error("incomplete SMTP credentials");
    }
    return new SmtpProvider({ host: creds.host, port: creds.port, username: creds.username, password: creds.password });
  }
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

  const gen = generation.get(row.orgId) ?? 0;
  // The flags are read on every send (the org flag comes with the row above), so
  // switching BYO off takes effect immediately rather than after the cache TTL.
  const flagged = byoEffective(row.byoFlag, byoGloballyEnabled());
  const hit = cache.get(row.orgId);
  if (hit && hit.flagged === flagged && Date.now() - hit.at < CACHE_MS) {
    if (hit.failure) throw hit.failure;
    return hit.resolved ?? ours();
  }

  // Platform mail: decided before any connection lookup, so a stray row on the
  // internal org could never move our own mail onto a tenant account.
  if (row.isInternal) {
    remember(row.orgId, gen, { flagged, resolved: null, failure: null });
    return ours();
  }

  const [conn] = await db
    .select()
    .from(orgSendingProviders)
    .where(eq(orgSendingProviders.organizationId, row.orgId))
    .limit(1);

  let own: MailProvider | null = null;
  let buildError: string | null = null;
  // SMTP and IAM-role connections exist only behind the flag: with the flag off
  // they are neither used nor silently swapped for our SES (rollback must not
  // move their volume onto us).
  const byoOnly = conn ? isByoOnlyConnection(conn.provider, conn.credentials, conn.credentialHint ?? null) : false;
  if (conn && conn.status === "active" && (flagged || !byoOnly)) {
    try {
      own = build(row.orgId, conn.provider, conn.credentials, conn.configurationSet ?? null, flagged);
      if (!own) buildError = `"${conn.provider}" is not a provider Rootmail can send through`;
    } catch (e) {
      // Undecryptable or malformed. The message never includes the value —
      // only our own wording when we refused deliberately.
      own = null;
      buildError = e instanceof ByoConnectionUnusable ? e.message : "the stored credentials could not be read; reconnect the account";
    }
  }

  const route = decideProviderRoute({
    isInternal: row.isInternal,
    flagged,
    connection: conn ? { status: conn.status } : null,
    buildError,
    byoOnly,
  });

  if (route.kind === "fail") {
    const failure = new ByoProviderUnavailable(conn?.provider ?? "provider", route.reason, row.orgId);
    remember(row.orgId, gen, { flagged, resolved: null, failure });
    throw failure;
  }
  if (route.kind === "own" && own) {
    const resolved: ResolvedProvider = {
      provider: own,
      byo: flagged
        ? { organizationId: row.orgId, providerName: conn!.provider, sendingDomains: conn!.sendingDomains ?? (conn!.sendingDomain ? [conn!.sendingDomain] : []) }
        : null,
    };
    remember(row.orgId, gen, { flagged, resolved, failure: null });
    return resolved;
  }
  remember(row.orgId, gen, { flagged, resolved: null, failure: null });
  return ours();
}
