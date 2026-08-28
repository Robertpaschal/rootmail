import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";
import type {
  CheckResult,
  DmarcPolicy,
  DomainReport,
  Mechanism,
  MechanismResult,
} from "./types";

/**
 * `/check` — the live DNS engine. Spec: `docs/design/04-EXPERIENCE.md` §6.
 *
 * WHY THIS DOES NOT CALL `auditEmailAuth()` FROM `@rootmail/core`
 * ---------------------------------------------------------------
 * §6.2 names that function as the engine, and its four statuses ARE the
 * vocabulary here. But it answers a different question, and shipping it on this
 * page would put a false claim about a stranger's infrastructure on screen:
 *
 *  1. Its SPF check is `found.includes("include:spf." + ROOTMAIL_DOMAIN)` and
 *     its DKIM check matches OUR selector and OUR key body. It answers "is this
 *     domain set up to send through rootmail", not "what does public DNS say
 *     about this domain's email authentication". Run against cloudflare.com it
 *     reports SPF missing and DKIM missing — both false.
 *  2. `verifyDnsRecords()` short-circuits to ok:true for EVERY record when
 *     `DNS_VERIFY_MODE=mock`, which is the default in `.env` locally, and its
 *     DMARC branch then hardcodes `p=none`. A mock rendering as a real result is
 *     precisely the failure this page exists to argue against.
 *  3. `@rootmail/core`'s entrypoint pulls in bullmq, ioredis and the env schema.
 *     `apps/marketing` is deliberately backend-free (CLAUDE.md).
 *
 * So the lookups are done here, directly, against a real resolver, always. There
 * is no mock path in this file and no environment variable can create one.
 *
 * PRIVACY (§6.4)
 * Nothing here logs, stores, caches or forwards the domain. There is no console
 * call in this module on purpose; do not add one. Aggregate counts only.
 *
 * SSRF (§6.4)
 * The input is a hostname handed to a DNS resolver. This module performs no HTTP
 * request of any kind, constructs no URL from user input, and follows nothing.
 */

// ---------------------------------------------------------------------------
// Input validation. Strict hostname, or nothing.
// ---------------------------------------------------------------------------

export interface ParsedDomain {
  domain: string;
  /** They pasted an email address and we took the part after the `@`. Said on screen. */
  fromEmail: boolean;
}

/**
 * Names that are reserved, internal, or resolve differently per network. A
 * lookup against these is either meaningless or is someone probing our
 * resolver's view of a private network, so they are refused by name.
 */
const REFUSED_TLDS = new Set([
  "local", "localhost", "localdomain", "internal", "intranet", "private",
  "corp", "home", "lan", "domain", "host", "test", "example", "invalid",
  "onion", "alt", "arpa", "i2p", "openstack",
]);

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseDomain(raw: unknown): ParsedDomain | { error: string } {
  if (typeof raw !== "string") return { error: "Enter a domain." };

  let value = raw.trim().toLowerCase();
  if (!value) return { error: "Enter a domain." };
  if (value.length > 320) return { error: "That is too long to be a domain name." };

  // §6.4: never accept an email address — if one is pasted, take the part after
  // the `@` and SAY SO. Silently checking something other than what they typed
  // would be the same category of lie as a mock rendering as a result.
  let fromEmail = false;
  if (value.includes("@")) {
    const at = value.lastIndexOf("@");
    const before = value.slice(0, at);
    // `user:password@host` and `https://user@host` are URL userinfo, not an
    // email address, and treating them as one would silently look up a host the
    // visitor never asked about while telling them we took "the part after the
    // @". Refuse instead of guessing — the same reasoning as the scheme/path
    // rejection below.
    if (/[:/\\]/.test(before)) {
      return { error: "Enter just the domain — no scheme, and no credentials before the @." };
    }
    value = value.slice(at + 1);
    fromEmail = true;
    if (!value) return { error: "That is an email address with no domain after the @." };
  }

  // A scheme, a path, a query, a port, whitespace or a credential means this is
  // a URL, not a hostname. We do not strip them — we refuse, because guessing
  // what someone meant is how a checker ends up checking the wrong thing.
  if (/[\s"'<>\\]/.test(value)) return { error: "A domain has no spaces or punctuation like that." };
  if (value.includes("://") || value.includes("/") || value.includes("?") || value.includes("#")) {
    return { error: "Enter just the domain — no scheme, no path. Example: yourcompany.com" };
  }
  if (value.includes(":")) {
    return { error: "Enter just the domain — no port, and no IPv6 address." };
  }

  // IDN → punycode. `domainToASCII` is the platform's IDNA implementation and
  // returns "" on anything it cannot represent, which is the rejection we want.
  const ascii = domainToASCII(value.replace(/\.$/, ""));
  if (!ascii) return { error: "That is not a domain name we can look up." };
  if (ascii.length > 253) return { error: "That is too long to be a domain name." };

  const labels = ascii.split(".");
  if (labels.length < 2) return { error: "Enter a full domain, including the ending. Example: yourcompany.com" };
  if (!labels.every((l) => LABEL.test(l))) return { error: "That is not a domain name we can look up." };

  const tld = labels[labels.length - 1]!;
  // An all-numeric last label means an IPv4 literal. DNS records for email
  // authentication do not live on an address, and resolving one on request is
  // the shape of an SSRF probe.
  if (/^[0-9]+$/.test(tld)) return { error: "Enter a domain name, not an IP address." };
  if (tld.length < 2) return { error: "That is not a domain name we can look up." };
  if (REFUSED_TLDS.has(tld)) {
    return { error: `“.${tld}” is a reserved or internal name — there is no public DNS to read.` };
  }

  return { domain: ascii, fromEmail };
}

// ---------------------------------------------------------------------------
// The resolver.
// ---------------------------------------------------------------------------

/** §6.4: the whole lookup gets 3 seconds. Each query gets less. */
const TOTAL_BUDGET_MS = 3_000;
const QUERY_TIMEOUT_MS = 2_400;

/**
 * DKIM keys live at `<selector>._domainkey.<domain>` and DNS offers no way to
 * list selectors. So we probe the selectors the large senders actually use, and
 * — this is the important part — when none of them resolve we report exactly
 * that, never "this domain has no DKIM". See `dkimResult()`.
 */
const DKIM_SELECTORS = [
  "google", "selector1", "selector2", "k1", "k2", "s1", "s2",
  "mail", "dkim", "default", "smtp", "mandrill", "fm1", "fm2",
  "protonmail", "zoho", "mxvault", "sig1", "dkim1", "rootmail",
] as const;

type Answer =
  /** The resolver answered and there are records. */
  | { kind: "records"; values: string[] }
  /** The resolver answered: nothing is published at that name. A fact. */
  | { kind: "empty" }
  /** The resolver did not answer. We know nothing. NOT the same as `empty`. */
  | { kind: "failed"; code: string };

/**
 * A definite "there is nothing there" from c-ares. Everything else — SERVFAIL,
 * REFUSED, timeout, connection error — means we could not look, and must never
 * be rendered as an absence of a record.
 */
const DEFINITE_ABSENCE = new Set(["ENODATA", "ENOTFOUND", "ENOTIMP"]);

function codeOf(err: unknown): string {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : "EUNKNOWN";
}

async function txt(resolver: Resolver, host: string): Promise<Answer> {
  try {
    const chunks = await resolver.resolveTxt(host);
    const values = chunks.map((parts) => parts.join("")).filter((v) => v.length > 0);
    return values.length ? { kind: "records", values } : { kind: "empty" };
  } catch (err) {
    const code = codeOf(err);
    return DEFINITE_ABSENCE.has(code) ? { kind: "empty" } : { kind: "failed", code };
  }
}

// ---------------------------------------------------------------------------
// Reading the records.
// ---------------------------------------------------------------------------

const isSpf = (v: string) => v.trim().toLowerCase().startsWith("v=spf1");
const isDmarc = (v: string) => v.trim().toLowerCase().startsWith("v=dmarc1");
const isBimi = (v: string) => v.trim().toLowerCase().startsWith("v=bimi1");
const isDkim = (v: string) => /(^|;)\s*v\s*=\s*dkim1\b/i.test(v) || /(^|;)\s*p\s*=\s*[A-Za-z0-9+/]/.test(v);

/**
 * A DKIM record carries a key only if its `p=` tag has something in it. RFC 6376
 * §3.6.1: **an empty `p=` means the key is REVOKED.** `example.com` publishes
 * `v=DKIM1; p=` at a wildcard `*._domainkey`, so a checker that treats "a DKIM
 * record answered" as "this domain signs its mail" reports twenty working
 * signing keys for a domain that has none — which is what this page did until a
 * live test caught it, and is exactly the false claim it exists to refuse.
 */
const hasKey = (v: string) => /(^|;)\s*p\s*=\s*[A-Za-z0-9+/]/.test(v);

/** The `all` mechanism is what makes an SPF record an assertion rather than a list. */
function spfAll(record: string): "-all" | "~all" | "?all" | "+all" | null {
  const m = /(?:^|\s)([-~?+]?)all(?:\s|$)/i.exec(record);
  if (!m) return null;
  const q = m[1] || "+";
  return `${q}all` as "-all" | "~all" | "?all" | "+all";
}

/** Same reading as `dmarcPolicy()` in `packages/core/src/dns.ts`, kept in step with it. */
function readDmarc(record: string): { policy: DmarcPolicy | null; pct: number } {
  const p = /\bp\s*=\s*(none|quarantine|reject)\b/i.exec(record);
  const pct = /\bpct\s*=\s*(\d{1,3})\b/i.exec(record);
  return {
    policy: (p?.[1]?.toLowerCase() as DmarcPolicy | undefined) ?? null,
    pct: pct ? Math.min(100, Number(pct[1])) : 100,
  };
}

function item(
  mechanism: Mechanism,
  status: MechanismResult["status"],
  lookup: MechanismResult["lookup"],
  detail: string,
  extra: Partial<MechanismResult> = {},
): MechanismResult {
  return {
    mechanism,
    status,
    lookup,
    detail,
    found: [],
    queried: [],
    fact: null,
    suggestion: null,
    caveat: null,
    ...extra,
  };
}

/** The one sentence we print whenever a resolver did not answer. */
function couldNotLook(mechanism: Mechanism, host: string, code: string): MechanismResult {
  return item(
    mechanism,
    "blocked",
    "failed",
    `The resolver did not answer for ${host} (${code}). We could not look — this is not a claim that the record is absent.`,
    { queried: [host], fact: code },
  );
}

function spfResult(domain: string, answer: Answer): MechanismResult {
  const host = domain;
  if (answer.kind === "failed") return couldNotLook("spf", host, answer.code);

  const records = answer.kind === "records" ? answer.values.filter(isSpf) : [];
  const base = { queried: [host], found: records };

  if (records.length === 0) {
    return item("spf", "missing", "answered",
      "No SPF record is published, so a receiver has no list of servers allowed to send as this domain.",
      { ...base, suggestion: { host: domain, value: "v=spf1 include:<your sending provider> -all" } });
  }
  if (records.length > 1) {
    return item("spf", "weak", "answered",
      "More than one SPF record is published. Receivers treat that as a permanent error and SPF stops working entirely.",
      { ...base, fact: `${records.length} records` });
  }

  const record = records[0]!;
  const all = spfAll(record);
  if (all === "-all" || all === "~all") {
    return item("spf", "pass", "answered",
      all === "-all"
        ? "SPF is published and ends in -all, so anything not listed fails outright."
        : "SPF is published and ends in ~all, so anything not listed is marked as suspicious.",
      { ...base, fact: all });
  }
  return item("spf", "weak", "answered",
    all === null
      ? "The record is published but has no all mechanism, so it never says what to do about a server that is not listed."
      : `The record is published but ends in ${all}, which tells receivers to accept mail from any server at all.`,
    { ...base, fact: all ?? "no all" ,
      suggestion: { host: domain, value: record.replace(/(?:^|\s)[-~?+]?all(?:\s|$)/i, " ").trim() + " ~all" } });
}

function dkimResult(domain: string, probes: Array<{ selector: string; answer: Answer }>): MechanismResult {
  const queried = probes.map((p) => `${p.selector}._domainkey.${domain}`);
  const recordsAt = (p: { answer: Answer }) =>
    p.answer.kind === "records" ? p.answer.values.filter(isDkim) : [];
  /** A DKIM record answered here — which is not yet a key. */
  const hits = probes.filter((p) => recordsAt(p).length > 0);
  /** A record with an actual key in it. The only thing that can verify a signature. */
  const live = probes.filter((p) => recordsAt(p).some(hasKey));
  const answered = probes.filter((p) => p.answer.kind !== "failed").length;

  // Every probe failed at the resolver. We looked at nothing.
  if (answered === 0) {
    const code = probes.find((p) => p.answer.kind === "failed");
    return {
      ...couldNotLook("dkim", `${DKIM_SELECTORS[0]}._domainkey.${domain}`,
        code && code.answer.kind === "failed" ? code.answer.code : "EUNKNOWN"),
      // All of them failed, so name all of them rather than the first.
      queried,
    };
  }

  // DNS cannot be asked "which selectors exist", so a hit is proof and a miss is
  // not. This caveat is the honest gap (00-PHILOSOPHY.md §5.5) on a stranger's
  // data, and it is the part of this page a competitor's checker will not copy.
  const caveat =
    "DNS cannot be asked which selectors a domain uses, so this is what we probed, not everything that exists.";

  if (hits.length === 0) {
    return item("dkim", "missing", "answered",
      `No signing key answered at the ${probes.length} selector names we tried. A key may still exist under a name we did not guess.`,
      { queried, caveat, fact: `0 of ${probes.length}` });
  }

  // Distinct values: a wildcard `*._domainkey` answers identically at every name
  // we try, and printing the same record twenty times is noise, not a receipt.
  const found = [...new Set(hits.flatMap(recordsAt))];
  const wildcard = hits.length === probes.length && found.length === 1;
  const at = (list: typeof probes) =>
    wildcard
      ? "every selector name we tried, which means a wildcard record rather than a key for each name"
      : `${list.map((h) => h.selector).join(", ")}._domainkey`;

  // Published, and revoked. Solid node, dashed continuation: the record is real
  // and it verifies nothing. Same shape as DMARC `p=none`, same reason (§6.2).
  if (live.length === 0) {
    return item("dkim", "weak", "answered",
      `A DKIM record answers at ${at(hits)}. Its p= tag is empty, which is how a key is revoked, so nothing can be verified with it.`,
      { queried, found, caveat, fact: "revoked" });
  }

  return item("dkim", "pass", "answered",
    `A signing key is published at ${at(live)}, so a receiver can verify a signature from it.`,
    {
      // Every name we asked about, not only the ones that answered. The caveat
      // under this row says "this is what we probed" — printing four of twenty
      // beneath that sentence would make the sentence false, and a sourcing line
      // that undercounts its own queries is the exact failure this page argues
      // against, committed by us instead of by a competitor.
      queried,
      found,
      caveat,
      fact: wildcard ? "wildcard" : live[0]!.selector,
    });
}

function dmarcResult(domain: string, answer: Answer): { result: MechanismResult; policy: DmarcPolicy | null; enforced: boolean } {
  const host = `_dmarc.${domain}`;
  if (answer.kind === "failed") {
    return { result: couldNotLook("dmarc", host, answer.code), policy: null, enforced: false };
  }

  const records = answer.kind === "records" ? answer.values.filter(isDmarc) : [];
  const base = { queried: [host], found: records };
  const starter = { host, value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` };

  if (records.length === 0) {
    return {
      result: item("dmarc", "missing", "answered",
        "No DMARC record. Receivers have no instruction for mail that fails checks, and nobody sends you a report about it.",
        { ...base, suggestion: starter }),
      policy: null,
      enforced: false,
    };
  }
  if (records.length > 1) {
    return {
      result: item("dmarc", "weak", "answered",
        "More than one DMARC record is published, and receivers ignore all of them when that happens.",
        { ...base, fact: `${records.length} records`, suggestion: starter }),
      policy: null,
      enforced: false,
    };
  }

  const record = records[0]!;
  const { policy, pct } = readDmarc(record);
  const stronger = { host, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}` };

  if (policy === null) {
    return {
      result: item("dmarc", "weak", "answered",
        "The record is published but carries no p= tag, so there is no policy in it and receivers discard the record.",
        { ...base, fact: "no p=", suggestion: starter }),
      policy: null,
      enforced: false,
    };
  }
  if (policy === "none") {
    // THE ARGUMENT (§6.2). The record is real — we read it — and it asks
    // receivers to do nothing. Solid node, dashed continuation.
    return {
      result: item("dmarc", "weak", "answered",
        "The record is published. Its policy is p=none, so it asks receivers to do nothing about mail that fails.",
        { ...base, fact: "p=none", suggestion: stronger }),
      policy,
      enforced: false,
    };
  }
  if (pct < 100) {
    return {
      result: item("dmarc", "weak", "answered",
        `The policy is p=${policy} but pct=${pct}, so it is applied to ${pct}% of failing mail and the rest passes through.`,
        { ...base, fact: `p=${policy} pct=${pct}`, suggestion: { host, value: record.replace(/\bpct\s*=\s*\d{1,3}\b/i, "pct=100") } }),
      policy,
      enforced: false,
    };
  }
  return {
    result: item("dmarc", "pass", "answered",
      policy === "reject"
        ? "DMARC is enforcing at p=reject, so mail that fails authentication is refused outright."
        : "DMARC is enforcing at p=quarantine, so mail that fails authentication goes to spam.",
      { ...base, fact: `p=${policy}` }),
    policy,
    enforced: true,
  };
}

function bimiResult(domain: string, answer: Answer, enforced: boolean): MechanismResult {
  const host = `default._bimi.${domain}`;
  if (answer.kind === "failed") return couldNotLook("bimi", host, answer.code);

  const records = answer.kind === "records" ? answer.values.filter(isBimi) : [];
  const base = { queried: [host], found: records };
  const suggestion = { host, value: `v=BIMI1; l=https://${domain}/logo.svg; a=` };

  if (records.length && enforced) {
    return item("bimi", "pass", "answered",
      "BIMI is published and DMARC is enforcing, so a mailbox provider that supports it can show your logo.",
      { ...base, fact: "published" });
  }
  if (records.length) {
    // Published, and stopped by a precondition rather than by us. Severed.
    return item("bimi", "blocked", "answered",
      "BIMI is published but DMARC is not enforcing, so no mailbox provider will show the logo.",
      { ...base, fact: "not eligible", caveat: "Gmail and Apple also require a verified mark certificate." });
  }
  if (!enforced) {
    return item("bimi", "blocked", "answered",
      "Nothing to check yet: BIMI needs DMARC at p=quarantine or p=reject before a logo can show anywhere.",
      { ...base, fact: "not eligible" });
  }
  return item("bimi", "missing", "answered",
    "DMARC is enforcing but no BIMI record is published, so the inbox shows an initial instead of your mark.",
    { ...base, suggestion, caveat: "Gmail and Apple also require a verified mark certificate." });
}

// ---------------------------------------------------------------------------
// The lookup.
// ---------------------------------------------------------------------------

class Timeout extends Error {}

export async function auditDomain(parsed: ParsedDomain): Promise<CheckResult> {
  const { domain, fromEmail } = parsed;
  const checkedAt = new Date().toISOString();
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resolver.cancel();
      reject(new Timeout());
    }, TOTAL_BUDGET_MS);
  });

  try {
    return await Promise.race([run(resolver, domain, fromEmail, checkedAt), deadline]);
  } catch (err) {
    if (err instanceof Timeout) {
      return {
        ok: false, domain, fromEmail, checkedAt, reason: "timed_out",
        detail: `lookup timed out at ${TOTAL_BUDGET_MS / 1000}s · we do not know`,
      };
    }
    return {
      ok: false, domain, fromEmail, checkedAt, reason: "resolver_failed",
      detail: `the resolver did not answer (${codeOf(err)}) · we could not look`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run(
  resolver: Resolver,
  domain: string,
  fromEmail: boolean,
  checkedAt: string,
): Promise<CheckResult> {
  // Does the name exist at all? An NS/SOA answer of NXDOMAIN is the resolver
  // telling us something definite, and it is a different sentence from a
  // resolver that fell over.
  const existence = await apex(resolver, domain);
  if (existence.kind === "nxdomain") {
    return {
      ok: false, domain, fromEmail, checkedAt, reason: "no_such_domain",
      detail: "the resolver answered NXDOMAIN · there is no such domain",
    };
  }
  if (existence.kind === "failed") {
    return {
      ok: false, domain, fromEmail, checkedAt, reason: "resolver_failed",
      detail: `the resolver did not answer for ${domain} (${existence.code}) · we could not look`,
    };
  }

  const [spfA, dmarcA, bimiA, probes] = await Promise.all([
    txt(resolver, domain),
    txt(resolver, `_dmarc.${domain}`),
    txt(resolver, `default._bimi.${domain}`),
    Promise.all(
      DKIM_SELECTORS.map(async (selector) => ({
        selector,
        answer: await txt(resolver, `${selector}._domainkey.${domain}`),
      })),
    ),
  ]);

  const spf = spfResult(domain, spfA);
  const dkim = dkimResult(domain, probes);
  const { result: dmarc, policy, enforced } = dmarcResult(domain, dmarcA);
  const bimi = bimiResult(domain, bimiA, enforced);

  const report: DomainReport = {
    ok: true,
    domain,
    fromEmail,
    checkedAt,
    queries: 3 + DKIM_SELECTORS.length + 1,
    items: [spf, dkim, dmarc, bimi],
    policy,
    enforced,
  };
  return report;
}

async function apex(
  resolver: Resolver,
  domain: string,
): Promise<{ kind: "exists" } | { kind: "nxdomain" } | { kind: "failed"; code: string }> {
  try {
    await resolver.resolveNs(domain);
    return { kind: "exists" };
  } catch (err) {
    const code = codeOf(err);
    // ENODATA: the name exists but has no NS of its own — a subdomain, which is
    // a perfectly ordinary thing to check.
    if (code === "ENODATA") return { kind: "exists" };
    if (code === "ENOTFOUND") return { kind: "nxdomain" };
    return { kind: "failed", code };
  }
}
