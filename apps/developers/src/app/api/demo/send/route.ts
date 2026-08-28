import { NextResponse } from "next/server";
import {
  CACHED_SEND,
  DEMO_RECIPIENT,
  DEMO_SUBJECT,
  type DemoRun,
} from "@/lib/demo";

/**
 * THE DEMO BACKEND — `docs/design/04-EXPERIENCE.md` §8.3.
 *
 * The panels on this page hit the real rootmail API, not canned JSON, because
 * a developer is convinced by running something and reading what comes back.
 * Four rules make that safe to expose on a public marketing page:
 *
 * 1. **The key never reaches the browser.** It lives in this process only, as
 *    `ROOTMAIL_DEMO_API_KEY` — a SANDBOX key for a dedicated demo workspace.
 * 2. **The recipient is forced here, server-side.** The request body from the
 *    browser carries no address and cannot: the only thing a visitor supplies
 *    is an idempotency key, and even that is pattern-checked. This is the one
 *    place a public demo could be turned into somebody's mailer, so it is not
 *    a validation rule — there is no field to validate.
 * 3. **20 calls an hour per IP.** In-memory, per instance; the API's own
 *    limiter is the real one, this only keeps us from leaning on it.
 * 4. **If the API does not answer in 2s, we say so on screen.** The fallback
 *    is the cached example, LABELLED with the time the live sandbox failed to
 *    answer. A demo that silently fakes it when it fails is the exact failure
 *    this company exists to argue against; admitting it is worth more than the
 *    demo working.
 *
 * With no key configured at all — a fresh clone, CI, a preview build — the
 * route still answers, with the labelled cached example. **The page must never
 * require credentials to render.**
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = (process.env.ROOTMAIL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const DEMO_KEY = process.env.ROOTMAIL_DEMO_API_KEY;
const TIMEOUT_MS = 2_000;
const LIMIT_PER_HOUR = 20;
const HOUR_MS = 3_600_000;

/** Only ever `demo-` plus hex the panel generated. Anything else is refused
 *  outright rather than sanitized — an idempotency key is an identifier we
 *  store, and the set of acceptable ones here is tiny and known. */
const KEY_SHAPE = /^demo-[0-9a-f]{6,32}$/;

const hits = new Map<string, { n: number; resetAt: number }>();

function overLimit(ip: string): boolean {
  const now = Date.now();
  const seen = hits.get(ip);
  if (!seen || seen.resetAt <= now) {
    hits.set(ip, { n: 1, resetAt: now + HOUR_MS });
    // Opportunistic sweep: this map is the only thing here that grows.
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    return false;
  }
  seen.n += 1;
  return seen.n > LIMIT_PER_HOUR;
}

function clockUtc(): string {
  return new Date().toISOString().slice(11, 19);
}

/** The cached example, wearing the reason it is being shown. */
function fallback(reason: string): NextResponse {
  const run: DemoRun = { ...CACHED_SEND, note: reason };
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (overLimit(ip)) {
    return fallback(
      `cached example — this address has used its ${LIMIT_PER_HOUR} live calls this hour`,
    );
  }

  let idempotencyKey: string | undefined;
  try {
    const body = (await request.json()) as { key?: unknown };
    if (typeof body.key === "string" && KEY_SHAPE.test(body.key)) idempotencyKey = body.key;
  } catch {
    /* no body is fine — a send without an idempotency key is still a send */
  }

  if (!DEMO_KEY) {
    return fallback("cached example — no live sandbox is configured for this deployment");
  }

  const started = Date.now();
  const abort = AbortSignal.timeout(TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/v1/messages`, {
      method: "POST",
      signal: abort,
      headers: {
        Authorization: `Bearer ${DEMO_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Forced. Not defaulted — the browser has no say in any of this.
        to: DEMO_RECIPIENT,
        subject: DEMO_SUBJECT,
        html: "<p>See you Friday.</p>",
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      }),
    });
    const ms = Date.now() - started;
    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return fallback(`cached example — the live sandbox answered ${res.status} at ${clockUtc()}`);
    }

    const run: DemoRun = {
      live: true,
      status: res.status,
      statusText: res.statusText || (res.status === 200 ? "OK" : "Accepted"),
      ms,
      replayed: res.headers.get("idempotent-replayed") === "true",
      body: {
        id: String(json.id ?? ""),
        object: String(json.object ?? "message"),
        status: String(json.status ?? ""),
        to: String(json.to ?? DEMO_RECIPIENT),
        subject: (json.subject as string | null) ?? null,
        sandbox: json.sandbox === true,
      },
    };
    return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
  } catch {
    return fallback(`cached example — the live sandbox did not answer at ${clockUtc()}`);
  }
}
