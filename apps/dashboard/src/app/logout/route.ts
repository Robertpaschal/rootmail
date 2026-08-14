import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/oauth";
import { SESSION_COOKIE, SIGNED_IN_HINT } from "@/lib/session";

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
 */
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get("reason");
  // appUrl(), NOT req.nextUrl.origin. Behind Caddy, Next resolves the request
  // origin to the CONTAINER — so building the redirect from it emits
  // localhost:3000 in production and works perfectly in local dev, which is
  // exactly how this trap stays invisible until someone is thrown out of the
  // app and lands nowhere.
  const res = NextResponse.redirect(appUrl(reason ? `/login?${reason}=1` : "/login"));
  res.cookies.delete(SESSION_COOKIE);
  // The cross-subdomain "signed in" hint the marketing site reads.
  res.cookies.delete(SIGNED_IN_HINT);
  return res;
}
