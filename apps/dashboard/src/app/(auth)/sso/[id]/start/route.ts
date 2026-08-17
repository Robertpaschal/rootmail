import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/oauth";
import { samlAuthorize } from "@/lib/rootmail";
import { ADD_ACCOUNT_COOKIE } from "@/lib/session";

// SP-initiated: ask the API to build the signed AuthnRequest redirect, then send
// the browser to the identity provider. The IdP posts back to ../acs.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { url } = await samlAuthorize(id);
    const res = NextResponse.redirect(url);
    // Multi-account: this is the last hop we control before the IdP takes over,
    // and it hands back only its assertion. Park the intent so ../acs knows to
    // JOIN the roster instead of replacing it. SameSite=None because the IdP
    // form-POSTs back cross-site — same requirement the ACS itself lives under.
    if (req.nextUrl.searchParams.get("add") === "1") {
      res.cookies.set(ADD_ACCOUNT_COOKIE, "1", {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        path: "/",
        maxAge: 600,
      });
    }
    return res;
  } catch {
    return NextResponse.redirect(appUrl("/sso?error=unavailable"));
  }
}
