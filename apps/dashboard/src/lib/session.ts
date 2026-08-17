import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "rm_session";
// A non-secret "there's a session on the dashboard host" hint, scoped to the
// PARENT domain (COOKIE_DOMAIN, e.g. .rootmail.io) so the marketing + developer
// sites can reflect the signed-in state and drop the "Sign in" wall. Carries no
// token — the real session cookie stays httpOnly + host-only. Local dev leaves
// COOKIE_DOMAIN unset: on localhost it's shared across ports anyway.
export const SIGNED_IN_HINT = "rm_signed_in";

/*
 * ── MULTI-ACCOUNT (several signed-in IDENTITIES in one browser) ────────────
 *
 * NOT to be confused with the workspace switcher. One user can already belong
 * to several organizations and move between their workspaces — that's
 * `sessions.active_workspace_id` and POST /v1/auth/active-workspace, and it is
 * untouched here. This is the layer ABOVE it: separate `users` rows, separate
 * emails, separate logins. An account CONTAINS workspaces.
 *
 * ── THE COOKIE DECISION ───────────────────────────────────────────────────
 * One cookie per account (`rm_acct_0` … `rm_acct_4`) holding that account's
 * session token, plus `rm_session` which mirrors whichever of them is ACTIVE.
 *
 * Why not one cookie holding a JSON array of tokens? A cookie is capped at
 * ~4KB by every browser, and a value that grows with the number of accounts
 * has a cliff at the end of it. More practically, a single blob fails as a
 * unit: one corrupt or oversized entry takes the whole roster with it,
 * whereas a per-account cookie is dropped on its own and the rest survive.
 * Each token is 47 bytes, so five slots cost ~300 bytes of request header —
 * nowhere near any limit, and each slot is independently expirable.
 *
 * Why keep `rm_session` at all, given the active token is already in a slot?
 * Because it is what the ENTIRE app reads — middleware, `rmFetch`, the
 * assistant stream route, every server component. Making the roster additive
 * means none of that changes and, crucially, that an existing user's plain
 * `rm_session` cookie IS already a valid one-account roster: the deploy logs
 * nobody out. The duplication is ~50 bytes of the same secret under the same
 * attributes on the same origin — no new exposure, and in exchange there is no
 * "which cookie is authoritative" question to get wrong. The active account is
 * DERIVED by matching `rm_session` against the slots, so there is no pointer
 * cookie that can drift out of step with it.
 *
 * Why five? Two costs grow with the roster: header bytes on every request, and
 * one extra API round trip to name the background accounts when the switcher
 * renders. Five covers the cases people actually have (own account + a client's
 * seat; two businesses; a personal and a work identity) with room to spare, and
 * is the same practical ceiling Google's switcher lands on. Past that the menu
 * stops being a switcher and starts being a list you have to read.
 */
export const ACCOUNT_SLOT_PREFIX = "rm_acct_";
export const MAX_ACCOUNTS = 5;

/**
 * Marks a sign-in that was started from "Add another account", for the flows
 * that leave our origin and come back (OAuth, SAML) and therefore cannot carry
 * a query string of ours. It selects a code path — join the roster rather than
 * replace it — and grants nothing on its own; the session it applies to is
 * still minted by the API against real credentials. Ten minutes, same as the
 * CSRF state it travels beside.
 */
export const ADD_ACCOUNT_COOKIE = "rm_add_account";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

function slotName(i: number): string {
  return `${ACCOUNT_SLOT_PREFIX}${i}`;
}

/** The dashboard login session token, read from the httpOnly cookie (server-only). */
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export interface Roster {
  /** Every signed-in account's token, in stable add-order (active included). */
  tokens: string[];
  /** Index into `tokens` of the account currently in use, or -1 when signed out. */
  activeIndex: number;
}

/**
 * Normalize whatever is in the cookie jar into a roster.
 *
 * Handles three shapes, and must keep handling all three:
 *  - the legacy jar (plain `rm_session`, no slots) → a one-account roster, which
 *    is why shipping this does not sign anybody out;
 *  - the new jar (slots + `rm_session` matching one of them);
 *  - a drifted jar (`rm_session` matches no slot, e.g. a stale tab completed an
 *    older sign-in). The token in `rm_session` is what the rest of the app is
 *    already acting as, so it wins: it is adopted into the roster rather than
 *    contradicted. The one state we never want is an active identity the
 *    switcher doesn't list.
 */
export async function readRoster(): Promise<Roster> {
  const store = await cookies();
  const active = store.get(SESSION_COOKIE)?.value ?? null;

  const tokens: string[] = [];
  for (let i = 0; i < MAX_ACCOUNTS; i++) {
    const v = store.get(slotName(i))?.value;
    // Skip blanks and duplicates; a slot only ever holds one whole token.
    if (v && !tokens.includes(v)) tokens.push(v);
  }

  if (!active) {
    // No active token means signed out. Background slots without an active
    // session are debris from an interrupted write — report an empty roster so
    // the caller clears them rather than silently resurrecting an identity.
    return { tokens: [], activeIndex: -1 };
  }

  const found = tokens.indexOf(active);
  if (found !== -1) return { tokens, activeIndex: found };

  // Drifted: `rm_session` names an account no slot lists. It wins — it is what
  // every other read in the app is already acting as. If the slots are full it
  // displaces the last one rather than being appended and then truncated away,
  // which would leave the app acting as an identity the switcher doesn't list.
  if (tokens.length >= MAX_ACCOUNTS) tokens.length = MAX_ACCOUNTS - 1;
  tokens.push(active);
  return { tokens, activeIndex: tokens.length - 1 };
}

interface CookieOp {
  name: string;
  value: string;
  maxAge: number;
  domain?: string;
}

/**
 * The complete set of cookie writes that make the jar equal `roster` — always
 * every slot, so shrinking the roster DELETES the slots it no longer uses
 * instead of leaving a live token behind. Pure, so the two callers below
 * (`cookies()` in an action, `NextResponse` in a route handler) cannot drift.
 */
function rosterCookieOps(tokens: string[], activeIndex: number, ttl = THIRTY_DAYS): CookieOp[] {
  const capped = tokens.slice(0, MAX_ACCOUNTS);
  const active = capped[activeIndex] ?? null;
  const ops: CookieOp[] = [];

  for (let i = 0; i < MAX_ACCOUNTS; i++) {
    const token = capped[i];
    ops.push({ name: slotName(i), value: token ?? "", maxAge: token ? ttl : 0 });
  }
  ops.push({ name: SESSION_COOKIE, value: active ?? "", maxAge: active ? ttl : 0 });
  // The cross-domain hint must be written and deleted with the SAME domain, or
  // the browser keeps it (a delete only matches on name+domain+path).
  ops.push({
    name: SIGNED_IN_HINT,
    value: active ? "1" : "",
    maxAge: active ? ttl : 0,
    domain: cookieDomain,
  });
  return ops;
}

function attrs(op: CookieOp, httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: op.maxAge,
    ...(op.domain ? { domain: op.domain } : {}),
  };
}

/** Persist a roster from a Server Action or Route Handler (via next/headers). */
export async function writeRoster(
  tokens: string[],
  activeIndex: number,
  opts: { maxAge?: number } = {},
): Promise<void> {
  const store = await cookies();
  for (const op of rosterCookieOps(tokens, activeIndex, opts.maxAge)) {
    // Only the hint is readable by JS; every token cookie stays httpOnly.
    store.set(op.name, op.value, attrs(op, op.name !== SIGNED_IN_HINT));
  }
}

/** Persist a roster onto an outgoing redirect (OAuth/SSO callbacks, /logout).
 *
 * `maxAge` exists for the impersonation door, whose session is deliberately far
 * shorter-lived than a normal one — the cookies should die about when it does. */
export function applyRoster<T extends NextResponse>(
  res: T,
  tokens: string[],
  activeIndex: number,
  opts: { maxAge?: number } = {},
): T {
  for (const op of rosterCookieOps(tokens, activeIndex, opts.maxAge)) {
    res.cookies.set(op.name, op.value, attrs(op, op.name !== SIGNED_IN_HINT));
  }
  return res;
}

/** Sign in as `token`, keeping the accounts already signed in. Returns the new roster.
 *
 * `replacesToken` is the token this one supersedes — set when the same identity
 * signs in again, so the roster shows one row per person instead of two rows
 * with the same email. Returns `full: true` (and changes nothing) at the cap. */
export function addToRoster(
  current: Roster,
  token: string,
  replacesToken?: string | null,
): { tokens: string[]; activeIndex: number; full: boolean } {
  const existing = replacesToken ? current.tokens.indexOf(replacesToken) : -1;
  if (existing !== -1) {
    const tokens = [...current.tokens];
    tokens[existing] = token;
    return { tokens, activeIndex: existing, full: false };
  }
  const already = current.tokens.indexOf(token);
  if (already !== -1) return { tokens: current.tokens, activeIndex: already, full: false };
  if (current.tokens.length >= MAX_ACCOUNTS) {
    return { tokens: current.tokens, activeIndex: current.activeIndex, full: true };
  }
  const tokens = [...current.tokens, token];
  return { tokens, activeIndex: tokens.length - 1, full: false };
}

export async function setSessionCookie(token: string): Promise<void> {
  // A fresh sign-in with no roster to preserve — used by flows that deliberately
  // REPLACE the browser's identity rather than add to it.
  await writeRoster([token], 0);
}

export async function clearSessionCookie(): Promise<void> {
  await writeRoster([], -1);
}
