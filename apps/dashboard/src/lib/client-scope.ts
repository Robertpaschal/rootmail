import { cookies } from "next/headers";

/**
 * Agency mode ("acting as a client"). The operator picks one of the workspace's
 * client domains (sub-tenants) and the dashboard scopes every client-aware
 * surface — messages, replies, campaigns, sequences, audience, templates,
 * analytics, deliverability — to that client, via the same X-Rootmail-Subtenant
 * header the public API uses. The selection lives in an httpOnly cookie so it
 * follows the operator across pages until they exit or switch workspace.
 */
export const CLIENT_SCOPE_COOKIE = "rm_client";

/** API path prefixes that understand per-client (sub-tenant) scope. Everything
 * else — auth, workspaces, billing, members, webhooks, and the client-domain
 * registry itself — is always workspace-level, so the acting-as header must
 * never ride along there (a scoped registry couldn't even clear the scope). */
const SCOPED_PREFIXES = [
  "/v1/messages",
  "/v1/threads",
  "/v1/campaigns",
  "/v1/sequences",
  "/v1/templates",
  "/v1/contacts",
  "/v1/lists",
  "/v1/suppressions",
  "/v1/imports",
  "/v1/analytics",
  "/v1/deliverability",
];

export function isClientScopedPath(path: string): boolean {
  const clean = path.split("?")[0] ?? path;
  return SCOPED_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
}

/** The raw acting-as id — cookie only, no lookup. Safe from any server context
 * (rmFetch calls it per request; server actions inherit mutations' scope). */
export async function getClientScopeId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CLIENT_SCOPE_COOKIE)?.value || null;
}

/*
 * NOTE: this module must stay dependency-free (cookies() only). `rootmail.ts`
 * imports it on every request to decide whether to send the scope header, so
 * importing the API client back from here would make the two circular. The
 * lookup that DOES need the API lives in `client-context.ts`.
 */
