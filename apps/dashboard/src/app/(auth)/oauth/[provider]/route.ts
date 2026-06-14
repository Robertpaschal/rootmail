import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, getProvider, isConfigured } from "@/lib/oauth";

// Kick off the OAuth dance: stash a CSRF state cookie, then bounce to the provider.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const p = getProvider(provider);
  if (!p || !isConfigured(p)) {
    return NextResponse.redirect(new URL("/login?error=provider", req.url));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(p, state));
  res.cookies.set("rm_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
