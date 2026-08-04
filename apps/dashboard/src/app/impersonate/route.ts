import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/rootmail";
import { SESSION_COOKIE } from "@/lib/session";
import { appUrl } from "@/lib/urls";

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
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes(":") || raw.includes("\\")) return "/";
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

  const response = NextResponse.redirect(appUrl(next));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30, // matches the 30-minute impersonation session
  });
  return response;
}
