import { auditDomain, parseDomain } from "./audit";
import { clientAddress, takeLookup } from "./rate-limit";
import type { CheckResult } from "./types";

/**
 * Validate → rate-limit → look up. The single path both entry points take: the
 * page's server action (`actions.ts`) and the public route handler
 * (`../api/check/route.ts`). One implementation so the limit and the validation
 * cannot drift apart — the mistake CLAUDE.md records about `assertCanSend`,
 * where two callers meant one guard silently covered half the traffic.
 */
export type LookupOutcome =
  | { ok: true; result: CheckResult }
  | { ok: false; status: 400 | 429; message: string; retryAfterSeconds?: number };

export async function lookup(raw: unknown, headers: Headers): Promise<LookupOutcome> {
  const parsed = parseDomain(raw);
  if ("error" in parsed) return { ok: false, status: 400, message: parsed.error };

  const verdict = takeLookup(clientAddress(headers));
  if (!verdict.ok) {
    return {
      ok: false,
      status: 429,
      retryAfterSeconds: verdict.retryAfterSeconds,
      message:
        verdict.scope === "ip"
          ? "That is ten domains in an hour from this address, which is the limit. Try again shortly."
          : "This checker is at its hourly limit across everyone using it. Try again shortly.",
    };
  }

  return { ok: true, result: await auditDomain(parsed) };
}
