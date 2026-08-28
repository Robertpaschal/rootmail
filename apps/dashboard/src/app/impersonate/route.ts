import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/rootmail";
import { applyRoster } from "@/lib/session";
import { appUrl } from "@/lib/urls";
import { SIGNED_IN_HOME } from "@/lib/home";

export const dynamic = "force-dynamic";

/**
 * Where to land after the handoff.
 *
 * This is an OPEN REDIRECT if you let it be one: the parameter arrives on a URL
 * anyone can construct, and the redirect happens right as we set a session
 * cookie — the most valuable moment to steal a click. So it is an allow-shaped
 * check, not a deny-list.
 *
 * A path only. It must start with a single "/" — "//evil.com" and "/\evil.com"
 * are both browser-legal ways to leave this origin, and a value containing ":"
 * can carry a scheme. Anything else silently becomes the dashboard home; there
 * is nothing for a caller to learn from an error here.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return SIGNED_IN_HOME;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return SIGNED_IN_HOME;
  if (raw.includes(":") || raw.includes("\\")) return SIGNED_IN_HOME;
  return raw;
}

// Staff handoff landing: exchange the one-time code for an impersonated session
// and drop the customer session cookie. Excluded from middleware so it runs even
// if the browser already has a (staff's own) dashboard session.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!code) return NextResponse.redirect(appUrl("/login?error=impersonation"));

  let token: string;
  try {
    const res = await api.acceptImpersonation(code);
    token = res.session_token;
  } catch {
    return NextResponse.redirect(appUrl("/login?error=impersonation"));
  }

  /*
   * ── A SUPPORT SESSION IS NEVER A PEER ────────────────────────────────────
   *
   * An impersonated session REPLACES the whole account roster. It never joins
   * one, and nothing may join it.
   *
   * The failure this prevents: a staff member with their own account signed in,
   * who then opens a customer for support, would otherwise end up with both
   * identities in one menu — and "switch account" becomes a control that moves
   * them between acting as themselves and acting as a customer. Those two
   * things look identical once the menu is shut, and everything done in the
   * second one is performed AS the customer, against their data, in their name.
   * That is why the impersonation banner shouts; a one-click switch beside it
   * would undo the shouting.
   *
   * It also fixes a lifetime mismatch: this session lives 30 minutes, roster
   * slots are written for 30 days, so a session that expires by design would
   * otherwise linger in the menu as a row that fails when clicked.
   *
   * Enforced in three places, because one is not enough for this:
   *   - here, by replacing the roster (applyRoster with a single token clears
   *     every other slot);
   *   - refuseAdd() in lib/accounts.ts, which every sign-in door funnels
   *     through, so nothing can be added beside it;
   *   - switchAccount() in components/app/account-actions.ts, which refuses to
   *     move off an impersonated session even though the first two rules should
   *     already have made that unreachable.
   *
   * Leaving impersonation therefore signs the browser out entirely (`signOut`
   * in app/actions.ts) — the staff member signs back into their own account,
   * which is a small cost for keeping the two kinds of identity apart.
   */
  // 30 minutes, matching the impersonation grant — the cookies should die about
  // when the session behind them does.
  return applyRoster(NextResponse.redirect(appUrl(next)), [token], 0, { maxAge: 60 * 30 });
}
