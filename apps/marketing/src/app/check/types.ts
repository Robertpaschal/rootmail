/**
 * `/check` — the shared vocabulary between the DNS engine (`audit.ts`, server
 * only), the route handler (`../api/check/route.ts`) and the UI.
 *
 * Kept free of any `node:` import so a client component can `import type` from
 * it without dragging the resolver into the browser bundle.
 *
 * The four statuses are deliberately the same four `packages/core/src/dns.ts`
 * uses (`pass | weak | missing | blocked`), because `docs/design/04-EXPERIENCE.md`
 * §6.2 maps THOSE names onto the rendering law. We do not import
 * `auditEmailAuth()` itself — see the header of `audit.ts` for why.
 */

export type CheckStatus = "pass" | "weak" | "missing" | "blocked";

export type Mechanism = "spf" | "dkim" | "dmarc" | "bimi";

/**
 * Whether the resolver actually answered.
 *
 * This is the field §6.4 exists for: "we did not find it" and "we could not
 * look" are different claims about someone else's infrastructure, and this
 * product of all products has to distinguish them. `status: "missing"` is only
 * ever set when `lookup === "answered"`. A resolver that failed produces
 * `status: "blocked"` with `lookup: "failed"`, and the copy says so.
 */
export type LookupOutcome = "answered" | "failed";

export interface MechanismResult {
  mechanism: Mechanism;
  status: CheckStatus;
  lookup: LookupOutcome;
  /** One line of plain English. What we can say, and nothing more. */
  detail: string;
  /** The records we read, verbatim. Never paraphrased, never summarised. */
  found: string[];
  /** Exactly which names we queried, so the answer can be reproduced. */
  queried: string[];
  /** A short mono fact for the station label: `~all`, `p=none`, `google`. */
  fact: string | null;
  /** The record to publish — only when we can honestly name one. */
  suggestion: { host: string; value: string } | null;
  /** The limit of what this check can prove. Printed under the row. */
  caveat: string | null;
}

export type DmarcPolicy = "none" | "quarantine" | "reject";

export interface DomainReport {
  ok: true;
  domain: string;
  /** The visitor pasted an email address; we took the part after the `@`. */
  fromEmail: boolean;
  /** ISO instant of the lookup. Rendered as `YYYY-MM-DD HH:MM:SS UTC`. */
  checkedAt: string;
  /** How many DNS names we queried to produce this. */
  queries: number;
  items: MechanismResult[];
  policy: DmarcPolicy | null;
  /** DMARC at p=quarantine or p=reject, applied to all mail. */
  enforced: boolean;
}

/**
 * We produced no report. Three reasons, and they are not the same reason —
 * conflating them is the lie this page is built to refuse.
 */
export interface DomainUnavailable {
  ok: false;
  domain: string;
  fromEmail: boolean;
  checkedAt: string;
  reason:
    /** The resolver answered: there is no such domain. A fact, not a failure. */
    | "no_such_domain"
    /** The resolver did not answer. We know nothing about this domain. */
    | "resolver_failed"
    /** We ran out of the 3 seconds we give ourselves. We know nothing. */
    | "timed_out";
  detail: string;
}

export type CheckResult = DomainReport | DomainUnavailable;

/** What a submitted domain is called on screen. */
export type Role = "yours" | "client";

export interface CheckedDomain {
  role: Role;
  result: CheckResult;
}

/** The `useActionState` shape. `idle` is the server-rendered resting state. */
export type CheckState =
  | { kind: "idle" }
  /** `raw` is echoed back so the inputs keep their values without JavaScript. */
  | { kind: "error"; message: string; raw: { domain: string; client: string } }
  | { kind: "done"; checked: CheckedDomain[] };

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  bimi: "BIMI",
};

/** The resting-state definition of each mechanism, before anything is checked. */
export const MECHANISM_DEFINITION: Record<Mechanism, string> = {
  spf: "Names the servers allowed to send as this domain.",
  dkim: "Publishes the key that signs the mail, so a receiver can verify it.",
  dmarc: "Tells receivers what to do when SPF and DKIM do not line up.",
  bimi: "Shows your logo in the inbox — only once DMARC is enforcing.",
};
