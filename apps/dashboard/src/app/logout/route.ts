import { NextResponse, type NextRequest } from "next/server";
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
  const url = new URL(reason ? `/login?${reason}=1` : "/login", req.nextUrl.origin);
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  // The cross-subdomain "signed in" hint the marketing site reads.
  res.cookies.delete(SIGNED_IN_HINT);
  return res;
}
