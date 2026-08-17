import { NextResponse, type NextRequest } from "next/server";
import { adoptToken } from "@/lib/accounts";
import { appUrl } from "@/lib/oauth";
import { api, samlAcs } from "@/lib/rootmail";
import { ADD_ACCOUNT_COOKIE, applyRoster } from "@/lib/session";

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
    /*
     * Multi-account policy for enterprise SSO — deliberate, not incidental.
     *
     * A SAML session JOINS the roster only when `rm_add_account` is present,
     * and that cookie is written in exactly one place: our own SP-initiated
     * ../start route, reached from the in-app "Add another account" door. So an
     * IdP-INITIATED sign-in — the admin's dashboard tile, an unsolicited POST
     * straight to this ACS, which is a legitimate SAML flow — can never join
     * anything. It always REPLACES, landing the user in a clean single-identity
     * session, which is what an IdP tile implies and what an admin expects from
     * it.
     *
     * What we did NOT do: make an SSO session exclusive, forbidding other
     * accounts beside it. That is a real policy question and the answer belongs
     * to the org, but there is nothing to hang it on yet — `sessions` records
     * no origin, so we cannot even tell later that a session came from SAML,
     * and `ssoConnections.enforced` means "this domain must use the IdP", not
     * "this device may hold one identity". Inventing exclusivity from that flag
     * would break the very case this feature exists for (a consultant holding
     * their own account plus a seat their client granted them) on a guess about
     * what an admin wants. If the owner wants it, it needs a `sessions.origin`
     * column and an org-level setting — not a reinterpretation of this one.
     */
    const add = req.cookies.get(ADD_ACCOUNT_COOKIE)?.value === "1";
    const next = await adoptToken(session.session_token, add);
    if (!next.ok) {
      // Revoke rather than leave a 30-day session nobody can reach.
      await api.logout(session.session_token).catch(() => undefined);
      return NextResponse.redirect(appUrl(`/login?add=1&refused=${next.reason}`), 303);
    }
    const res = applyRoster(NextResponse.redirect(appUrl("/"), 303), next.tokens, next.activeIndex);
    res.cookies.delete(ADD_ACCOUNT_COOKIE);
    return res;
  } catch {
    return NextResponse.redirect(appUrl("/sso?error=saml"), 303);
  }
}
