import { NextResponse, type NextRequest } from "next/server";
import { appUrl, exchangeCode, fetchProfile, getProvider, isConfigured } from "@/lib/oauth";
import { adoptToken } from "@/lib/accounts";
import { api, oauthUpsert } from "@/lib/rootmail";
import { ADD_ACCOUNT_COOKIE, applyRoster } from "@/lib/session";

/**
 * Land the session this callback just minted on the redirect that carries the
 * browser back into the app — replacing the browser's identity for an ordinary
 * social sign-in, or joining the account roster when "Add another account"
 * started the flow (the `rm_add_account` cookie is how that survives the trip
 * out to the provider and back).
 */
async function landSession(
  res: NextResponse,
  token: string,
  add: boolean,
  status: 302 | 303,
): Promise<NextResponse> {
  const next = await adoptToken(token, add);
  if (!next.ok) {
    // Refused (roster full, or a support session is in progress). A social door
    // can only find this out AFTER the provider has vouched, so revoke the
    // session rather than strand it for thirty days, and answer on the page
    // they asked from.
    await api.logout(token).catch(() => undefined);
    return NextResponse.redirect(appUrl(`/login?add=1&refused=${next.reason}`), status);
  }
  return applyRoster(res, next.tokens, next.activeIndex);
}

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

    const res = await landSession(
      NextResponse.redirect(appUrl("/")),
      session.session_token,
      req.cookies.get(ADD_ACCOUNT_COOKIE)?.value === "1",
      302,
    );
    res.cookies.delete("rm_oauth_state");
    res.cookies.delete("rm_oauth_invite");
    res.cookies.delete(ADD_ACCOUNT_COOKIE);
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

    const res = await landSession(
      NextResponse.redirect(appUrl("/"), 303),
      session.session_token,
      req.cookies.get(ADD_ACCOUNT_COOKIE)?.value === "1",
      303,
    );
    res.cookies.delete("rm_oauth_state");
    res.cookies.delete("rm_oauth_invite");
    res.cookies.delete(ADD_ACCOUNT_COOKIE);
    return res;
  } catch (err) {
    return NextResponse.redirect(appUrl("/login?error=oauth"), 303);
  }
}
