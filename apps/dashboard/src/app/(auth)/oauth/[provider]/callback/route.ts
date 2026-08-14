import { NextResponse, type NextRequest } from "next/server";
import { appUrl, exchangeCode, fetchProfile, getProvider, isConfigured } from "@/lib/oauth";
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
    return NextResponse.redirect(appUrl("/login?error=provider"));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("rm_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    // CSRF mismatch — say nothing useful to whoever caused it.
    return NextResponse.redirect(appUrl("/login?error=oauth"));
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
      // Closed beta: only needed to CREATE an account; the API ignores it for
      // an existing tester signing back in.
      invite_code: req.cookies.get("rm_oauth_invite")?.value,
    });

    const res = NextResponse.redirect(appUrl("/"));
    res.cookies.set(SESSION_COOKIE, session.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.delete("rm_oauth_state");
    res.cookies.delete("rm_oauth_invite");
    return res;
  } catch (err) {
    return NextResponse.redirect(appUrl(`/signup?error=${encodeURIComponent(String((err as { message?: string })?.message ?? "oauth"))}`));
  }
}

// Apple returns via form_post (application/x-www-form-urlencoded), so it lands
// here as a POST. Same dance as GET, but code/state come from the form body and
// the display name arrives once in a `user` JSON blob. Redirects use 303 so the
// browser follows them as GETs.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const p = getProvider(provider);
  if (!p || !isConfigured(p)) {
    return NextResponse.redirect(appUrl("/login?error=provider"), 303);
  }

  const form = await req.formData();
  const code = form.get("code")?.toString();
  const state = form.get("state")?.toString();
  const cookieState = req.cookies.get("rm_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(appUrl("/login?error=oauth"), 303);
  }

  // Apple sends the user's name only on the first authorization.
  let name: string | undefined;
  const userRaw = form.get("user")?.toString();
  if (userRaw) {
    try {
      const u = JSON.parse(userRaw) as { name?: { firstName?: string; lastName?: string } };
      name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" ") || undefined;
    } catch (err) {
      /* ignore a malformed user blob */
    }
  }

  try {
    const token = await exchangeCode(p, code);
    const profile = await fetchProfile(p, token);
    if (!profile.email) throw new Error("No email from provider");

    const session = await oauthUpsert({
      provider: p.id,
      email: profile.email,
      name: name ?? profile.name,
      email_verified: profile.emailVerified,
      // Closed beta: only needed to CREATE an account; the API ignores it for
      // an existing tester signing back in.
      invite_code: req.cookies.get("rm_oauth_invite")?.value,
    });

    const res = NextResponse.redirect(appUrl("/"), 303);
    res.cookies.set(SESSION_COOKIE, session.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.delete("rm_oauth_state");
    res.cookies.delete("rm_oauth_invite");
    return res;
  } catch (err) {
    return NextResponse.redirect(appUrl("/login?error=oauth"), 303);
  }
}
