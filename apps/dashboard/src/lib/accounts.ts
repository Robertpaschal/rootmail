import "server-only";
import { api } from "./rootmail";
import { MAX_ACCOUNTS, addToRoster, readRoster, type Roster } from "./session";

/**
 * The browser's roster of signed-in ACCOUNTS (identities), resolved for display.
 *
 * The unit here is an account — one `users` row, one email, one login — and each
 * account contains its own workspaces. The workspace switcher is a level below
 * this and is not touched by any of it.
 */

export interface AccountEntry {
  /** Index into the roster's token list — what the switch action is given. */
  index: number;
  active: boolean;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  /** Which workspace this account was last in, so the nesting reads at a glance. */
  workspaceName: string | null;
}

export interface AccountsView {
  entries: AccountEntry[];
  /** A staff support session. The switcher collapses to the borrowed identity
   *  alone — see refuseAdd() for why an impersonation is never a peer. */
  impersonating: boolean;
  /** Tokens that no longer resolve. Never rendered as accounts — we can't even
   *  name them, the token is dead — but the count is surfaced so a silently
   *  shorter list isn't the only signal the user gets. */
  expiredCount: number;
  canAdd: boolean;
  max: number;
}

/** The active account's own details, which the caller already has from `me()`. */
export interface ActiveIdentity {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  workspaceName: string | null;
  /** From `me().impersonating` — a staff member acting as this customer. */
  impersonating: boolean;
}

/**
 * Build the switcher's view.
 *
 * The active account is passed in rather than re-fetched: every caller already
 * has it from `api.me()`, and a browser with ONE account (very nearly all of
 * them) must not pay a single extra request for a feature it isn't using. Only
 * the BACKGROUND tokens are sent to the API.
 *
 * Never throws. A switcher that can take the shell down with it would be a bad
 * trade for a convenience feature, so any failure degrades to "just this account".
 */
export async function listAccounts(active: ActiveIdentity | null): Promise<AccountsView> {
  const roster = await readRoster();
  if (!active || roster.activeIndex === -1) {
    return { entries: [], impersonating: false, expiredCount: 0, canAdd: false, max: MAX_ACCOUNTS };
  }

  const activeEntry: AccountEntry = {
    index: roster.activeIndex,
    active: true,
    email: active.email,
    name: active.name,
    avatarUrl: active.avatarUrl,
    workspaceName: active.workspaceName,
  };

  // A support session stands alone: no peers listed, no door to add one. The
  // server refuses both regardless (refuseAdd, switchAccount) — this just keeps
  // the menu from offering what the actions would reject.
  if (active.impersonating) {
    return {
      entries: [activeEntry],
      impersonating: true,
      expiredCount: 0,
      canAdd: false,
      max: MAX_ACCOUNTS,
    };
  }

  const background = roster.tokens
    .map((token, index) => ({ token, index }))
    .filter((t) => t.index !== roster.activeIndex);

  if (background.length === 0) {
    return {
      entries: [activeEntry],
      impersonating: false,
      expiredCount: 0,
      canAdd: roster.tokens.length < MAX_ACCOUNTS,
      max: MAX_ACCOUNTS,
    };
  }

  let resolved;
  try {
    resolved = await api.resolveAccounts(background.map((t) => t.token));
  } catch {
    // The API is unreachable or the active session just died — either way the
    // layout already handles the second case. Show what we can.
    return {
      entries: [activeEntry],
      impersonating: false,
      expiredCount: 0,
      canAdd: roster.tokens.length < MAX_ACCOUNTS,
      max: MAX_ACCOUNTS,
    };
  }

  const byRef = new Map(resolved.data.map((r) => [r.ref, r]));
  const entries: AccountEntry[] = [activeEntry];
  let expiredCount = 0;
  background.forEach((t, ref) => {
    const row = byRef.get(ref);
    if (!row) {
      expiredCount++;
      return;
    }
    entries.push({
      index: t.index,
      active: false,
      email: row.user.email,
      name: row.user.name,
      avatarUrl: row.user.avatar_url,
      workspaceName: row.active_workspace_name,
    });
  });

  entries.sort((a, b) => a.index - b.index);
  return {
    entries,
    impersonating: false,
    expiredCount,
    canAdd: roster.tokens.length - expiredCount < MAX_ACCOUNTS,
    max: MAX_ACCOUNTS,
  };
}

/** Why a browser may not take on another account right now. */
export type AddRefusal = "full" | "impersonating" | "unavailable";

export const ADD_REFUSAL_MESSAGE: Record<AddRefusal, string> = {
  full: `You're signed into ${MAX_ACCOUNTS} accounts, the most one browser can hold. Sign out of one first.`,
  impersonating:
    "You're signed in as a customer for support. Stop impersonating before adding another account.",
  unavailable: "We couldn't check your other accounts just now. Try again in a moment.",
};

/**
 * May this browser sign into ANOTHER account, keeping the ones it has?
 *
 * ── THE IMPERSONATION RULE ────────────────────────────────────────────────
 * No. Not while any session in the roster is a staff impersonation.
 *
 * A support session is somebody else's identity, borrowed. If it could sit in
 * the switcher beside a real account, then "switch account" becomes a control
 * that moves a staff member between acting as themselves and acting as a
 * customer — two things that must never be one click apart, and that look
 * nearly identical once the menu is closed. The impersonation banner is loud
 * precisely because that confusion has a blast radius: actions taken there are
 * performed AS the customer, against their data, in their name.
 *
 * The other half of the rule lives in app/impersonate/route.ts, which REPLACES
 * the whole roster when a support session starts. Between the two, an
 * impersonated session is always alone in the browser: nothing can be added
 * next to it, and it never joins anything.
 *
 * ── WHY IT FAILS CLOSED ───────────────────────────────────────────────────
 * If we can't reach the API we can't rule out an impersonated session, and the
 * cost of guessing wrong in each direction is not symmetric: refusing costs a
 * retry, allowing costs the footgun above. So an unreachable API refuses.
 *
 * Note this is the SERVER's copy of the rule. The switcher also hides the add
 * door while impersonating, but UI that hides a thing is not a control — every
 * sign-in door funnels through here.
 */
export async function refuseAdd(): Promise<AddRefusal | null> {
  const roster = await readRoster();
  // A signed-out browser has nothing to protect and nothing to add to — the
  // "add" flag just degrades to an ordinary sign-in.
  if (roster.tokens.length === 0) return null;

  let resolved;
  try {
    resolved = await api.resolveAccounts(roster.tokens);
  } catch {
    return "unavailable";
  }
  if (resolved.data.some((r) => r.impersonating)) return "impersonating";
  // Count only what's alive: dead entries are about to be pruned anyway, and
  // refusing on their behalf would strand someone below the real cap.
  if (resolved.data.length >= MAX_ACCOUNTS) return "full";
  return null;
}

/**
 * Fold a freshly-minted session into the browser's roster.
 *
 * The single implementation behind every sign-in door — password, MFA, signup,
 * social, SAML — because they differ only in how they persist the result
 * (`writeRoster` from an action, `applyRoster` on a redirect), never in what
 * the result should be. Three copies of this is how one door quietly stops
 * honouring "keep my other account signed in".
 *
 * `add` false replaces the browser's identity outright, which is what an
 * ordinary sign-in on a signed-out browser means. `add` true keeps the existing
 * accounts and makes the new one active.
 *
 * Signing in again as someone already in the roster REPLACES their row instead
 * of adding a second one with the same email, matched by USER ID rather than by
 * the address that was typed — one identity can arrive through a password, a
 * social button or SSO. The superseded session is revoked so it isn't left
 * alive and unreachable.
 *
 * On refusal the caller MUST revoke the token it minted — an unused session
 * otherwise sits on the server for its full thirty days — and tell the user.
 */
export type AdoptResult =
  | { ok: true; tokens: string[]; activeIndex: number }
  | { ok: false; reason: AddRefusal };

export async function adoptToken(token: string, add: boolean): Promise<AdoptResult> {
  // A sign-in that REPLACES the browser's identity needs no permission: it
  // leaves one account signed in, which is where every browser starts.
  if (!add) return { ok: true, tokens: [token], activeIndex: 0 };

  // Every door — password, MFA, signup, Google/GitHub/Apple, SAML — reaches the
  // roster through here, so this is the one place the rule has to hold.
  const refusal = await refuseAdd();
  if (refusal) return { ok: false, reason: refusal };

  const roster = await readRoster();
  let supersedes: string | null = null;
  try {
    // The incoming token is appended, so its ref is the old roster's length.
    const resolved = await api.resolveAccounts([...roster.tokens, token], token);
    const incoming = resolved.data.find((r) => r.ref === roster.tokens.length);
    const same = incoming
      ? resolved.data.find((r) => r.ref !== roster.tokens.length && r.user.id === incoming.user.id)
      : undefined;
    if (same) supersedes = roster.tokens[same.ref] ?? null;
  } catch {
    /* couldn't tell — adding a row is the recoverable direction */
  }

  const next = addToRoster(roster, token, supersedes);
  // refuseAdd() counted only LIVE sessions, so a roster padded with dead ones
  // can still be structurally full here.
  if (next.full) return { ok: false, reason: "full" };
  if (supersedes) await api.logout(supersedes).catch(() => undefined);
  return { ok: true, tokens: next.tokens, activeIndex: next.activeIndex };
}

/**
 * The index of the first token that still resolves, or -1 if none do.
 *
 * Each candidate is tried as its OWN Bearer, because this runs on the paths
 * where the previously-active session has just been revoked or has expired —
 * there is no other live credential to authenticate the lookup with. Bounded by
 * the roster cap, and only ever reached when someone is signing out or being
 * signed out, so the worst case is a handful of requests on a rare path.
 */
export async function firstLiveIndex(tokens: string[]): Promise<number> {
  for (let i = 0; i < tokens.length; i++) {
    try {
      const resolved = await api.resolveAccounts([tokens[i]], tokens[i]);
      if (resolved.data.length > 0) return i;
    } catch {
      /* dead, or the API is unreachable — either way, try the next one */
    }
  }
  return -1;
}

/**
 * Drop tokens the API no longer recognises, keeping the active one pinned.
 *
 * Used by every path that WRITES the roster (switching, signing out, adding an
 * account, /logout), so a revoked session is cleaned out as a side effect of
 * normal use rather than accumulating. `bearer` is required when the caller has
 * just changed which account is active, since the request's cookie jar still
 * holds the old one.
 */
export async function pruneRoster(
  roster: Roster,
  bearer?: string,
): Promise<{ tokens: string[]; activeIndex: number }> {
  if (roster.tokens.length <= 1) return { tokens: roster.tokens, activeIndex: roster.activeIndex };
  const activeToken = roster.tokens[roster.activeIndex] ?? null;
  let live: Set<number>;
  try {
    const resolved = await api.resolveAccounts(roster.tokens, bearer);
    live = new Set(resolved.data.map((r) => r.ref));
  } catch {
    // Can't tell live from dead → change nothing. Pruning on a failed lookup
    // would sign people out of accounts that are perfectly fine.
    return { tokens: roster.tokens, activeIndex: roster.activeIndex };
  }
  const tokens = roster.tokens.filter((_, i) => live.has(i));
  let activeIndex = activeToken ? tokens.indexOf(activeToken) : -1;
  // The account in use died between the render and this call. Hand over to a
  // survivor rather than returning activeIndex -1, which writes an empty
  // `rm_session` and signs the browser out of accounts that are still good.
  if (activeIndex === -1 && tokens.length > 0) activeIndex = 0;
  return { tokens, activeIndex };
}
