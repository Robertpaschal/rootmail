import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, fetchProfile, getProvider, isConfigured } from "@/lib/oauth";
import { oauthUpsert } from "@/lib/rootmail";
import { SESSION_COOKIE } from "@/lib/session";

// Provider redirects back here with a code: verify state, exchange for a profile,
// upsert the user + session via the API, set the session cookie, land in the app.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const p = getProvider(provider);
  if (!p || !isConfigured(p)) {
    return NextResponse.redirect(new URL("/login?error=provider", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("rm_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  }

  try {
    const token = await exchangeCode(p, code);
    const profile = await fetchProfile(p, token);
    if (!profile.email) throw new Error("No email from provider");

    const session = await oauthUpsert({
      provider: p.id,
      email: profile.email,
      name: profile.name,
      email_verified: profile.emailVerified,
    });

    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(SESSION_COOKIE, session.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.delete("rm_oauth_state");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  }
}
