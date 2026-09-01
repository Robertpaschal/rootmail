import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "@/app/check/lookup";
import { LIMITS } from "@/app/check/rate-limit";

/**
 * `POST /api/check` — the public domain check, as JSON.
 *
 * Spec: `docs/design/04-EXPERIENCE.md` §6.4. It lives here rather than on the
 * Fastify API because `apps/marketing` is deliberately backend-free (CLAUDE.md)
 * and this endpoint touches nothing but a DNS resolver.
 *
 * POST, not GET, and that is a privacy decision rather than a REST one: a query
 * string puts the visitor's domain into every access log and every referrer
 * between here and them, and §6.4 says we do not keep the domain. A body does
 * not travel that way, and there is no URL to share that names what somebody
 * checked — the screenshot is the sharing mechanism, not a permalink.
 *
 * Node runtime: the edge runtime has no `node:dns`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Robots-Tag": "noindex",
} as const;

export async function POST(req: NextRequest) {
  let domain: unknown;
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      domain = ((await req.json()) as { domain?: unknown } | null)?.domain;
    } else {
      domain = (await req.formData()).get("domain");
    }
  } catch {
    return NextResponse.json(
      { error: "Send {\"domain\":\"yourbusiness.com\"} as JSON." },
      { status: 400, headers: NO_STORE },
    );
  }

  const outcome = await lookup(domain, req.headers);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.message, limit: LIMITS.perIp, window: "1h" },
      {
        status: outcome.status,
        headers: outcome.retryAfterSeconds
          ? { ...NO_STORE, "Retry-After": String(outcome.retryAfterSeconds) }
          : NO_STORE,
      },
    );
  }

  return NextResponse.json(outcome.result, { headers: NO_STORE });
}

/** A GET would put the domain in the URL. Say why, rather than 405-ing silently. */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "POST {\"domain\":\"yourbusiness.com\"}. This endpoint refuses GET so the domain never lands in a URL, a log or a referrer.",
      limit: `${LIMITS.perIp}/hour per address, ${LIMITS.global}/hour overall`,
    },
    { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
  );
}
