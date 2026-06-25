import { NextResponse, type NextRequest } from "next/server";
import { appUrl, authorizeUrl, getProvider, isConfigured } from "@/lib/oauth";

// Kick off the OAuth dance: stash a CSRF state cookie, then bounce to the provider.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const p = getProvider(provider);
  if (!p || !isConfigured(p)) {
    return NextResponse.redirect(appUrl("/login?error=provider"));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(p, state));
  // Apple returns via a cross-site form_post, so its state cookie must be
  // SameSite=None; Secure (Apple requires HTTPS redirect URIs anyway).
  const crossSite = p.id === "apple";
  res.cookies.set("rm_oauth_state", state, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
