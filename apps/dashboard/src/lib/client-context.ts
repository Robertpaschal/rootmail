import { cache } from "react";
import { getClientScopeId } from "./client-scope";
import { api } from "./rootmail";
import type { SubTenant } from "./types";

/**
 * The acting-as-client lookup, split out of `client-scope.ts` so that module
 * can stay free of any import of the API client — `rmFetch` imports it per
 * request, and a cycle there is the kind of thing that works in dev and
 * explodes in a production bundle.
 */
export interface ClientContext {
  /** All client domains in the active workspace ([] when none or feature-locked). */
  tenants: SubTenant[];
  /** The validated acting-as client, or null when browsing the whole workspace. */
  active: SubTenant | null;
  /**
   * A selection that no longer resolves — the client domain was deleted, or the
   * cookie outlived its workspace.
   *
   * This case MUST stay visible. The scope cookie is still on every request, so
   * the API 404s ("Sub-tenant … not found in this workspace") on every scoped
   * page; if the banner rendered only for `active`, the operator would lose the
   * one control that clears it and be left with a broken dashboard and a topbar
   * cheerfully claiming "All clients".
   */
  staleId: string | null;
}

/**
 * Sub-tenants + the validated acting-as selection, deduped per request (the
 * layout banner, topbar switcher, and any page share ONE lookup). Swallows
 * errors: a workspace without the feature, or an unreachable API, simply
 * renders unscoped. The registry call itself is never client-scoped, so this
 * stays alive even if a stale cookie breaks scoped pages.
 */
export const getClientContext = cache(async (): Promise<ClientContext> => {
  const id = await getClientScopeId();
  let tenants: SubTenant[] = [];
  try {
    tenants = (await api.listSubTenants()).data;
  } catch {
    // No feature, or the API is unreachable. Either way we can't classify the
    // cookie, so claim nothing rather than accuse a live client of being stale.
    return { tenants: [], active: null, staleId: null };
  }
  const active = id ? (tenants.find((t) => t.id === id) ?? null) : null;
  return { tenants, active, staleId: id && !active ? id : null };
});
