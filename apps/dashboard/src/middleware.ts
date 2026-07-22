import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SIGNED_IN_HINT } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/signup"];
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * The parent domain the cross-subdomain "signed-in" hint is scoped to (e.g.
 * ".gateml.io"), so the marketing + developer sites can read it. Prefer the
 * explicit COOKIE_DOMAIN, but fall back to deriving the registrable parent from
 * the request host: edge middleware can't reliably read runtime-only env (it's
 * inlined at build, where COOKIE_DOMAIN isn't set), and the host is an
 * unambiguous source of truth. Returns undefined for localhost / bare IPs so the
 * cookie is host-only in dev (on localhost it's shared across ports anyway).
 */
function hintDomain(req: NextRequest): string | undefined {
  const env = process.env.COOKIE_DOMAIN;
  if (env && env.length > 0) return env;
  const host = req.nextUrl.hostname;
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined;
  const labels = host.split(".");
  if (labels.length < 2) return undefined;
  return "." + labels.slice(-2).join("."); // dashboard.gateml.io -> .gateml.io
}

/**
 * Keep the non-secret rm_signed_in hint in lockstep with the real session on
 * EVERY request — not just at login — so a user who was already signed in when
 * the hint shipped still gets it on their next page load, and it's cleared once
 * the session is gone. The hint carries no token; rm_session stays httpOnly +
 * host-only. Only writes when the state actually changed, to avoid a redundant
 * Set-Cookie on every request.
 */
function syncHint(req: NextRequest, hasSession: boolean, res: NextResponse): NextResponse {
  const hasHint = req.cookies.get(SIGNED_IN_HINT)?.value === "1";
  if (hasSession && !hasHint) {
    res.cookies.set(SIGNED_IN_HINT, "1", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS,
      domain: hintDomain(req),
    });
  } else if (!hasSession && hasHint) {
    res.cookies.set(SIGNED_IN_HINT, "", { path: "/", maxAge: 0, domain: hintDomain(req) });
  }
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  // The OAuth start + callback routes must be reachable WITHOUT a session (the
  // session is minted by the callback) — and a signed-in user must not be
  // bounced mid-flow either. They validate provider + CSRF state themselves and
  // redirect appropriately, so let them through untouched.
  if (pathname.startsWith("/oauth/")) {
    return NextResponse.next();
  }

  // The SSO flow (email prompt → IdP redirect → ACS) is the same shape: the ACS
  // mints the session, so it must run without one, and a signed-in user shouldn't
  // be bounced mid-flow. Let the whole /sso subtree through.
  if (pathname === "/sso" || pathname.startsWith("/sso/")) {
    return NextResponse.next();
  }

  // Hosted audience signup pages are for the CUSTOMER'S subscribers — fully
  // public, branded per audience, session or not.
  if (pathname.startsWith("/subscribe/")) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Not signed in → send to login.
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return syncHint(req, hasSession, NextResponse.redirect(url));
  }

  // Already signed in → skip the auth screens.
  if (hasSession && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return syncHint(req, hasSession, NextResponse.redirect(url));
  }

  return syncHint(req, hasSession, NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|impersonate).*)",
  ],
};
