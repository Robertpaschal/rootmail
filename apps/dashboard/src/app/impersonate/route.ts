import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/rootmail";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Staff handoff landing: exchange the one-time code for an impersonated session
// and drop the customer session cookie. Excluded from middleware so it runs even
// if the browser already has a (staff's own) dashboard session.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=impersonation", req.url));

  let token: string;
  try {
    const res = await api.acceptImpersonation(code);
    token = res.session_token;
  } catch {
    return NextResponse.redirect(new URL("/login?error=impersonation", req.url));
  }

  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30, // matches the 30-minute impersonation session
  });
  return response;
}
