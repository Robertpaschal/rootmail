import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/oauth";
import { samlAuthorize } from "@/lib/rootmail";

// SP-initiated: ask the API to build the signed AuthnRequest redirect, then send
// the browser to the identity provider. The IdP posts back to ../acs.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { url } = await samlAuthorize(id);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(appUrl("/sso?error=unavailable"));
  }
}
