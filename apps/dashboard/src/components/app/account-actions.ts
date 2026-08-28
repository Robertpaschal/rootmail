"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIGNED_IN_HOME } from "@/lib/home";
import { firstLiveIndex, pruneRoster } from "@/lib/accounts";
import { CLIENT_SCOPE_COOKIE } from "@/lib/client-scope";
import { api } from "@/lib/rootmail";
import { readRoster, writeRoster } from "@/lib/session";

/*
 * Switching between signed-in ACCOUNTS (identities), not workspaces.
 *
 * ── WHY THESE ARE SERVER ACTIONS AND NOT A GET ROUTE ──────────────────────
 * Changing which identity a browser is acting as, from a URL anyone can put in
 * an <img> tag or a link, is a CSRF primitive: an attacker who can make your
 * browser issue `GET /switch-account?i=1` can silently move you into a
 * different account and then watch you type into it — or, on the sign-out
 * endpoints, log you out of everything. Server Actions are POST-only, carry an
 * unguessable action id that is not in any URL, and Next verifies the request's
 * Origin against the host before running them. That is the CSRF defence, and it
 * is why none of this is reachable by navigation.
 *
 * ── WHAT ONE ACCOUNT CAN DO TO ANOTHER ────────────────────────────────────
 * Nothing. The switch moves cookies around inside one browser; it never asks
 * the API to act on account B using account A's token. Every request afterwards
 * carries B's own Bearer, and the API resolves it exactly as it would on a
 * fresh login — same session row, same org memberships, same permissions.
 * Selection is BY INDEX, so a caller can only ever choose among tokens the
 * browser already holds; there is no parameter here that names an account.
 */

export interface AccountActionState {
  error?: string;
}

/** Agency mode is pinned to one workspace of one account — it cannot survive a
 *  switch, or every scoped call in the new account 404s. */
async function clearClientScope(): Promise<void> {
  (await cookies()).delete(CLIENT_SCOPE_COOKIE);
}

/** Make the account at `index` the active one, keeping the others signed in. */
export async function switchAccount(index: number): Promise<AccountActionState> {
  const roster = await readRoster();
  const target = roster.tokens[index];
  if (!target) return { error: "That account is no longer signed in." };
  if (index === roster.activeIndex) return {};

  // Two questions, one round trip:
  //  1. is the target still good, BEFORE handing the browser over to it —
  //     otherwise the switch "succeeds" and drops the user straight into the
  //     expired-session eject, which reads as the product breaking;
  //  2. is the session we are leaving a staff impersonation?
  //
  // (2) should be unreachable: starting a support session replaces the whole
  //     roster (app/impersonate/route.ts) so there is nothing to switch TO, and
  //     nothing may be added beside it (refuseAdd). It is checked anyway, and
  //     fails closed, because "switch identity" and "act as a customer" ending
  //     up one click apart is the one mistake here with a blast radius — and an
  //     invariant maintained in two other files is not one I want this to
  //     depend on silently.
  const current = roster.tokens[roster.activeIndex];
  let live = false;
  try {
    const probe = await api.resolveAccounts(current ? [target, current] : [target], target);
    if (probe.data.some((r) => r.impersonating)) {
      return { error: "Stop impersonating before switching accounts." };
    }
    live = probe.data.some((r) => r.ref === 0);
  } catch {
    return { error: "We couldn't switch accounts just now. Try again." };
  }
  if (!live) {
    // Degrade: take the dead account out of the roster rather than leaving a
    // row that fails every time it's clicked.
    const tokens = roster.tokens.filter((_, i) => i !== index);
    const activeIndex = tokens.indexOf(roster.tokens[roster.activeIndex] ?? "");
    await writeRoster(tokens, activeIndex);
    revalidatePath("/", "layout");
    return { error: "That account's session has expired. Sign in again to add it back." };
  }

  const pruned = await pruneRoster({ ...roster, activeIndex: index }, target);
  await writeRoster(pruned.tokens, pruned.activeIndex);
  await clearClientScope();

  // Land on the app home rather than staying put. The current URL names a
  // record inside the OLD account (a campaign, a contact, a thread); carrying it
  // across identities produces a 404 at best and, at worst, a page that looks
  // like the other account's data failed to load.
  revalidatePath("/", "layout");
  redirect(SIGNED_IN_HOME);
}

/**
 * Sign out of the account in use, and stay in whichever others are signed in.
 *
 * Only the active session is revoked server-side. Signing out of one identity
 * must never touch another's session row — that would make "sign out" on a
 * shared machine mean something different from what it says.
 */
export async function signOutAccount(): Promise<never> {
  const roster = await readRoster();
  const activeToken = roster.tokens[roster.activeIndex] ?? null;
  try {
    await api.logout();
  } catch {
    /* revoke is best-effort; the cookie goes either way */
  }

  const remaining = roster.tokens.filter((t) => t !== activeToken);
  if (remaining.length === 0) {
    await writeRoster([], -1);
    await clearClientScope();
    redirect("/login");
  }

  const next = await firstLiveIndex(remaining);
  await clearClientScope();
  if (next === -1) {
    await writeRoster([], -1);
    redirect("/login?expired=1");
  }
  // Everything before `next` failed to resolve, so it goes too.
  const kept = remaining.filter((_, i) => i >= next);
  await writeRoster(kept, 0);
  revalidatePath("/", "layout");
  redirect(SIGNED_IN_HOME);
}

/** Sign out of every account on this browser, revoking each session. */
export async function signOutAllAccounts(): Promise<never> {
  const roster = await readRoster();
  // Sequential rather than parallel: each call carries a different Bearer and
  // this is a handful of requests on a deliberate, terminal action.
  for (const token of roster.tokens) {
    try {
      await api.logout(token);
    } catch {
      /* a session that's already gone is the outcome we wanted */
    }
  }
  await writeRoster([], -1);
  await clearClientScope();
  redirect("/login");
}

/** Clear roster entries whose sessions no longer resolve. */
export async function dismissExpiredAccounts(): Promise<AccountActionState> {
  const roster = await readRoster();
  const pruned = await pruneRoster(roster);
  await writeRoster(pruned.tokens, pruned.activeIndex);
  revalidatePath("/", "layout");
  return {};
}
