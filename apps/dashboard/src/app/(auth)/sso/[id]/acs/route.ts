import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/oauth";
import { samlAcs } from "@/lib/rootmail";
import { SESSION_COOKIE } from "@/lib/session";

// Assertion Consumer Service: the IdP form-POSTs the SAML response here. We relay
// it to the API (which verifies the signature, JIT-provisions the member, and mints
// a session), set the rm_session cookie, and land in the app. 303 so the browser
// follows as a GET. This is the only place a SAML response is trusted — and only
// after the API's cryptographic validation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let samlResponse: string | undefined;
  try {
    const form = await req.formData();
    samlResponse = form.get("SAMLResponse")?.toString();
  } catch {
    return NextResponse.redirect(appUrl("/sso?error=saml"), 303);
  }
  if (!samlResponse) return NextResponse.redirect(appUrl("/sso?error=saml"), 303);

  try {
    const session = await samlAcs(id, samlResponse);
    const res = NextResponse.redirect(appUrl("/"), 303);
    res.cookies.set(SESSION_COOKIE, session.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.redirect(appUrl("/sso?error=saml"), 303);
  }
}
