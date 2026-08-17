import { NextResponse, type NextRequest } from "next/server";
import { firstLiveIndex } from "@/lib/accounts";
import { appUrl } from "@/lib/oauth";
import { applyRoster, readRoster } from "@/lib/session";

/**
 * Clear the session and send them to the login page.
 *
 * A route handler, not a helper called from a layout: a Server Component may
 * not write cookies during render, and calling the cookie-clearing helper from
 * the app layout threw — turning "your session expired" into a 500. This is the
 * one place allowed to do both halves.
 *
 * `reason=expired` lets the login page say what happened, so a tester whose
 * account was reset is told rather than left guessing why they were thrown out.
 *
 * ── MULTI-ACCOUNT ────────────────────────────────────────────────────────
 * One dead session must not evict the identities that are still perfectly
 * good. So this drops the account that failed and, if the browser is signed
 * into others, hands over to the first one that still resolves instead of
 * dumping the user at /login. The survivor is VERIFIED before promotion:
 * promoting blindly would bounce back here on the next render, and while that
 * loop is bounded by the roster size it would look exactly like the redirect
 * loop it isn't.
 */
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get("reason");
  const roster = await readRoster();
  const dead = roster.tokens[roster.activeIndex] ?? null;
  const remaining = roster.tokens.filter((t) => t !== dead);

  if (remaining.length > 0) {
    const next = await firstLiveIndex(remaining);
    if (next !== -1) {
      // Everything before the survivor failed to resolve too, so it goes with it.
      const kept = remaining.filter((_, i) => i >= next);
      // `switched=expired` lets the app say which way it just moved the user;
      // silently landing in another account would be its own kind of alarming.
      return applyRoster(NextResponse.redirect(appUrl("/?switched=expired")), kept, 0);
    }
  }

  // appUrl(), NOT req.nextUrl.origin. Behind Caddy, Next resolves the request
  // origin to the CONTAINER — so building the redirect from it emits
  // localhost:3000 in production and works perfectly in local dev, which is
  // exactly how this trap stays invisible until someone is thrown out of the
  // app and lands nowhere.
  const res = NextResponse.redirect(appUrl(reason ? `/login?${reason}=1` : "/login"));
  // Clears rm_session, every rm_acct_* slot, and the cross-subdomain hint the
  // marketing site reads — a partial clear here is how a "signed out" browser
  // keeps a live token.
  return applyRoster(res, [], -1);
}
