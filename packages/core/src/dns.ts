import type { SubTenantStatus } from "./constants";
import { resolveCname, resolveMx, resolveTxt } from "node:dns/promises";
import { env } from "./env";

export type DnsRecordPurpose = "ownership" | "dkim" | "dkim_next" | "spf" | "dmarc";

export interface DnsRecord {
  purpose: DnsRecordPurpose;
  /**
   * CNAME appears for SES-managed DKIM: Amazon publishes the public half and
   * holds the private half, so the customer points at Amazon rather than
   * publishing a key we generated.
   */
  type: "TXT" | "CNAME";
  host: string;
  value: string;
  required: boolean;
}

export interface DnsCheck {
  purpose: DnsRecordPurpose;
  host: string;
  required: boolean;
  ok: boolean;
  expected: string;
  found: string[];
  detail?: string;
}

export interface BuildDnsInput {
  domain: string;
  verificationToken: string;
  dkimSelector: string;
  dkimValue: string;
  /**
   * The INCOMING signing key during a rotation, published alongside the current
   * one. Emitted as `required: false` — deliberately and load-bearingly so.
   *
   * `isVerified()` and the drift sweep judge REQUIRED records only. If this were
   * required, merely starting a rotation would mark a perfectly healthy tenant's
   * DNS as failing, and six hours later the drift sweep would stop their sending
   * — because we asked them to add a record and they hadn't yet. Rotation must
   * never be able to do that.
   */
  pendingDkimSelector?: string | null;
  pendingDkimValue?: string | null;
  /**
   * SES Easy-DKIM tokens for this domain. When present these REPLACE the
   * self-generated DKIM record — Amazon holds the key and signs with it, so
   * publishing a key of ours alongside would be a record that authenticates
   * nothing and one more thing for the customer to get wrong.
   */
  sesDkimTokens?: readonly string[] | null;
}

/** The DNS records a sub-tenant must publish to verify + authenticate their domain. */
export function buildDnsRecords(input: BuildDnsInput): DnsRecord[] {
  const { domain, verificationToken, dkimSelector, dkimValue } = input;
  const pending: DnsRecord[] =
    input.pendingDkimSelector && input.pendingDkimValue
      ? [
          {
            purpose: "dkim_next",
            type: "TXT",
            host: `${input.pendingDkimSelector}._domainkey.${domain}`,
            value: input.pendingDkimValue,
            // See BuildDnsInput.pendingDkimSelector — never required.
            required: false,
          },
        ]
      : [];
  // SES-managed DKIM replaces our own record entirely when present.
  const dkimRecords: DnsRecord[] = input.sesDkimTokens?.length
    ? sesDkimRecords(domain, input.sesDkimTokens)
    : [
        {
          purpose: "dkim",
          type: "TXT",
          host: `${dkimSelector}._domainkey.${domain}`,
          value: dkimValue,
          required: true,
        },
      ];

  const rest: DnsRecord[] = [
    {
      purpose: "ownership",
      type: "TXT",
      host: `_rootmail.${domain}`,
      value: `rootmail-verify=${verificationToken}`,
      required: true,
    },
    ...dkimRecords,
    {
      purpose: "spf",
      type: "TXT",
      host: domain,
      value: `v=spf1 include:spf.${env.ROOTMAIL_DOMAIN} ~all`,
      required: false,
    },
    {
      // A starter DMARC policy (monitor-only). Once SPF+DKIM are aligned, the
      // auth audit nudges the user up to p=quarantine then p=reject.
      purpose: "dmarc",
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      required: false,
    },
  ];
  return pending.concat(rest);
}

const stripWs = (s: string) => s.replace(/\s+/g, "");

function matches(record: DnsRecord, txtValues: string[]): boolean {
  // A CNAME either points where we said or it does not — no parsing, and the
  // trailing dot and case are normalised at lookup.
  if (record.type === "CNAME") {
    const want = record.value.replace(/\.$/, "").toLowerCase();
    return txtValues.some((v) => v === want);
  }
  switch (record.purpose) {
    case "ownership":
      return txtValues.some((v) => stripWs(v) === stripWs(record.value));
    case "dkim_next":
    case "dkim": {
      // Match on the unique public-key body (p=...) so selector/whitespace differences don't matter.
      const p = record.value.split("p=")[1];
      if (!p) return false;
      const needle = stripWs(p);
      return txtValues.some((v) => stripWs(v).includes(needle));
    }
    case "spf":
      return txtValues.some(
        (v) =>
          v.toLowerCase().includes("v=spf1") &&
          v.includes(`include:spf.${env.ROOTMAIL_DOMAIN}`),
      );
    case "dmarc":
      return txtValues.some((v) => v.toLowerCase().includes("v=dmarc1"));
    default:
      return false;
  }
}

/**
 * Check whether the expected DNS records are live.
 * In `mock` mode (local dev) every record auto-passes so the flow is demoable
 * without owning a real domain.
 */
export async function verifyDnsRecords(records: DnsRecord[]): Promise<DnsCheck[]> {
  if (env.DNS_VERIFY_MODE === "mock") {
    return records.map((record) => ({
      purpose: record.purpose,
      host: record.host,
      required: record.required,
      ok: true,
      expected: record.value,
      found: [],
      detail: "DNS_VERIFY_MODE=mock — auto-verified for local development",
    }));
  }

  return Promise.all(
    records.map(async (record): Promise<DnsCheck> => {
      try {
        // CNAME records (SES-managed DKIM) resolve through a different query
        // than TXT, and a TXT lookup against a CNAME host returns nothing —
        // which would read as "the customer never published it".
        const flat =
          record.type === "CNAME"
            ? (await resolveCname(record.host)).map((h) => h.replace(/\.$/, "").toLowerCase())
            : (await resolveTxt(record.host)).map((chunks) => chunks.join(""));
        return {
          purpose: record.purpose,
          host: record.host,
          required: record.required,
          ok: matches(record, flat),
          expected: record.value,
          found: flat,
        };
      } catch (err) {
        return {
          purpose: record.purpose,
          host: record.host,
          required: record.required,
          ok: false,
          expected: record.value,
          found: [],
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}

/** A domain is verified once every *required* record resolves correctly. */
export function isVerified(checks: DnsCheck[]): boolean {
  return checks.filter((c) => c.required).every((c) => c.ok);
}

// ---------------------------------------------------------------------------
// Branded reply domain (own-domain replies). A customer points a reply subdomain
// (reply.theirco.com) at rootmail's inbound so replies come back on THEIR domain
// but still land in the Replies inbox. Needs an MX (route mail to us) + a TXT
// (prove ownership). Distinct from the sub-tenant TXT records above.
// ---------------------------------------------------------------------------

export interface ReplyDnsRecord {
  type: "MX" | "TXT";
  host: string;
  value: string;
  priority?: number;
  required: boolean;
  detail: string;
}

export interface ReplyDnsCheck {
  type: "MX" | "TXT";
  host: string;
  ok: boolean;
  expected: string;
  found: string[];
  detail?: string;
}

/** The DNS records a customer publishes to receive replies on their own domain. */
export function replyDnsRecords(domain: string, token: string): ReplyDnsRecord[] {
  return [
    {
      type: "MX",
      host: domain,
      value: env.INBOUND_MX_HOST,
      priority: 10,
      required: true,
      detail: "Routes replies sent to this subdomain into your rootmail inbox.",
    },
    {
      type: "TXT",
      host: `_rootmail-reply.${domain}`,
      value: `rootmail-reply-verify=${token}`,
      required: true,
      detail: "Proves you own this domain before we start receiving its mail.",
    },
  ];
}

/**
 * Check the reply-domain records are live. `mock` mode (local dev) auto-passes so
 * the flow is demoable without a real domain. Verifying DNS does NOT itself turn
 * on receiving — staff still provision the SES receipt rule and flip to active.
 */
export async function verifyReplyDns(
  domain: string,
  token: string,
): Promise<{ ok: boolean; checks: ReplyDnsCheck[] }> {
  const records = replyDnsRecords(domain, token);
  if (env.DNS_VERIFY_MODE === "mock") {
    return {
      ok: true,
      checks: records.map((r) => ({
        type: r.type,
        host: r.host,
        ok: true,
        expected: r.value,
        found: [],
        detail: "DNS_VERIFY_MODE=mock — auto-verified for local development",
      })),
    };
  }

  const checks = await Promise.all(
    records.map(async (r): Promise<ReplyDnsCheck> => {
      try {
        if (r.type === "MX") {
          const mx = await resolveMx(r.host);
          const found = mx.map((m) => m.exchange.toLowerCase().replace(/\.$/, ""));
          return { type: "MX", host: r.host, ok: found.includes(r.value.toLowerCase()), expected: r.value, found };
        }
        const txts = await resolveTxt(r.host);
        const found = txts.map((chunks) => chunks.join(""));
        return { type: "TXT", host: r.host, ok: found.some((v) => stripWs(v) === stripWs(r.value)), expected: r.value, found };
      } catch (err) {
        return { type: r.type, host: r.host, ok: false, expected: r.value, found: [], detail: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  return { ok: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------------------------------
// Email-authentication audit (Vision 2, phase 2). Builds on the records above to
// report posture for SPF, DKIM, DMARC and BIMI — each with the exact record to
// publish and a recommendation to strengthen a weak setup. SPF/DKIM reuse the
// verification check; DMARC adds policy interpretation; BIMI is advisory and
// gated on DMARC being enforced.
// ---------------------------------------------------------------------------

export type EmailAuthMechanism = "spf" | "dkim" | "dmarc" | "bimi";
export type EmailAuthStatus = "pass" | "weak" | "missing" | "blocked";

export interface EmailAuthItem {
  mechanism: EmailAuthMechanism;
  status: EmailAuthStatus;
  label: string;
  detail: string;
  recommendation: string | null;
  record: { type: "TXT"; host: string; value: string } | null;
  found: string[];
}

export interface EmailAuthReport {
  domain: string;
  mode: "mock" | "live";
  dmarc_policy: DmarcPolicy | null;
  items: EmailAuthItem[];
  summary: { passing: number; total: number; enforced: boolean };
}

export type DmarcPolicy = "none" | "quarantine" | "reject";

/** Pull the policy (p=) out of a DMARC TXT record, or null if there isn't one. */
export function dmarcPolicy(found: string[]): DmarcPolicy | null {
  const rec = found.find((v) => v.toLowerCase().includes("v=dmarc1"));
  if (!rec) return null;
  const m = /\bp\s*=\s*(none|quarantine|reject)\b/i.exec(rec);
  return (m?.[1]?.toLowerCase() as DmarcPolicy | undefined) ?? "none";
}

async function lookupTxt(host: string): Promise<string[]> {
  try {
    const txts = await resolveTxt(host);
    return txts.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

function mechItem(
  mechanism: EmailAuthMechanism,
  status: EmailAuthStatus,
  label: string,
  detail: string,
  recommendation: string | null,
  record: { host: string; value: string } | null,
  found: string[],
): EmailAuthItem {
  return {
    mechanism,
    status,
    label,
    detail,
    recommendation,
    record: record ? { type: "TXT", host: record.host, value: record.value } : null,
    found,
  };
}

export async function auditEmailAuth(input: BuildDnsInput): Promise<EmailAuthReport> {
  const { domain } = input;
  const mock = env.DNS_VERIFY_MODE === "mock";
  const records = buildDnsRecords(input);
  const checks = await verifyDnsRecords(records);
  const recOf = (p: DnsRecordPurpose) => records.find((r) => r.purpose === p)!;
  const checkOf = (p: DnsRecordPurpose) => checks.find((c) => c.purpose === p);

  // --- SPF ---
  const spfItem: EmailAuthItem = checkOf("spf")?.ok
    ? mechItem("spf", "pass", "SPF", "SPF authorizes rootmail's servers to send for this domain.", null, null, checkOf("spf")?.found ?? [])
    : mechItem(
        "spf",
        "missing",
        "SPF",
        "No SPF record authorizes rootmail — receivers can't confirm the envelope sender.",
        "Add the SPF TXT record (or merge the include into your existing SPF).",
        recOf("spf"),
        checkOf("spf")?.found ?? [],
      );

  // --- DKIM ---
  const dkimItem: EmailAuthItem = checkOf("dkim")?.ok
    ? mechItem("dkim", "pass", "DKIM", "Messages are cryptographically signed and the public key is published.", null, null, checkOf("dkim")?.found ?? [])
    : mechItem(
        "dkim",
        "missing",
        "DKIM",
        "The DKIM key isn't published, so signatures can't be verified.",
        "Publish the DKIM TXT record, then verify the domain.",
        recOf("dkim"),
        checkOf("dkim")?.found ?? [],
      );

  // --- DMARC (policy interpretation) ---
  // Mock mode reports the common real-world "p=none" so the strengthen-guidance
  // is demoable; live mode reads and parses the actual record.
  const dmarcFound = mock ? [] : await lookupTxt(`_dmarc.${domain}`);
  const policy: DmarcPolicy | null = mock ? "none" : dmarcPolicy(dmarcFound);
  const enforced = policy === "quarantine" || policy === "reject";
  let dmarcItem: EmailAuthItem;
  if (policy === null) {
    dmarcItem = mechItem(
      "dmarc",
      "missing",
      "DMARC",
      "No DMARC record — receivers have no policy for unauthenticated mail and you get no reports.",
      "Start with a monitor-only policy (p=none) and watch the aggregate reports.",
      recOf("dmarc"),
      dmarcFound,
    );
  } else if (policy === "none") {
    dmarcItem = mechItem(
      "dmarc",
      "weak",
      "DMARC",
      "DMARC is monitor-only (p=none): failures are reported but not enforced.",
      "Once SPF and DKIM pass consistently, move to p=quarantine, then p=reject.",
      { host: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}` },
      dmarcFound,
    );
  } else {
    dmarcItem = mechItem(
      "dmarc",
      "pass",
      "DMARC",
      `DMARC is enforced (p=${policy}) — spoofed mail is ${policy === "reject" ? "rejected" : "quarantined"}.`,
      null,
      null,
      dmarcFound,
    );
  }

  // --- BIMI (advisory; needs DMARC enforcement + a logo) ---
  const bimiFound = mock ? [] : await lookupTxt(`default._bimi.${domain}`);
  const bimiPresent = bimiFound.some((v) => v.toLowerCase().includes("v=bimi1"));
  const bimiRecord = { host: `default._bimi.${domain}`, value: `v=BIMI1; l=https://${domain}/bimi-logo.svg` };
  let bimiItem: EmailAuthItem;
  if (bimiPresent && enforced) {
    bimiItem = mechItem("bimi", "pass", "BIMI", "BIMI is published and DMARC is enforced — your logo can show in supporting inboxes.", null, null, bimiFound);
  } else if (!enforced) {
    bimiItem = mechItem(
      "bimi",
      "blocked",
      "BIMI",
      "BIMI needs DMARC at p=quarantine or p=reject before mailbox providers will show your logo.",
      "Enforce DMARC first, then publish a square SVG logo (a VMC is required for Gmail/Apple).",
      bimiRecord,
      bimiFound,
    );
  } else {
    bimiItem = mechItem(
      "bimi",
      "missing",
      "BIMI",
      "DMARC is enforced but no BIMI record is published.",
      "Publish a BIMI record pointing at a square SVG logo to show your brand in inboxes.",
      bimiRecord,
      bimiFound,
    );
  }

  const items = [spfItem, dkimItem, dmarcItem, bimiItem];
  return {
    domain,
    mode: mock ? "mock" : "live",
    dmarc_policy: policy,
    items,
    summary: { passing: items.filter((i) => i.status === "pass").length, total: items.length, enforced },
  };
}

// ---------------------------------------------------------------------------
// DNS drift (brief P2.2)
//
// Verification is one-shot at creation; this is the decision that re-checking
// turns into an action. Kept PURE and here rather than in the worker for the
// same reason `evaluateReputation` is: the rules are the product's promise about
// when it will and won't stop a paying customer's mail, and a promise that can
// only be exercised by standing up Postgres and Redis does not get exercised.
// ---------------------------------------------------------------------------

export type DnsDriftAction =
  /** Healthy and was healthy — just record that we looked. */
  | { action: "none" }
  /** Records resolve again. `restoreSending` when we were the reason it stopped. */
  | { action: "recovered"; restoreSending: boolean }
  /** First failed check. Start the clock and tell them; nothing is restricted. */
  | { action: "drifted" }
  /** Still failing, still inside the grace period. Do not re-notify. */
  | { action: "grace"; hoursElapsed: number }
  /** Failing continuously past the grace period. Stop the sending. */
  | { action: "suspend" };

export interface DnsDriftInput {
  /** Did every REQUIRED record resolve on this check? */
  ok: boolean;
  /** When failures started, or null if the domain was healthy at the last check. */
  failingSince: Date | null;
  /** The tenant's current sending status. */
  status: SubTenantStatus;
  /** A reputation pause outranks DNS and must survive a DNS recovery. */
  reputationPaused: boolean;
  now: Date;
  graceHours: number;
}

export function decideDnsDrift(input: DnsDriftInput): DnsDriftAction {
  const { ok, failingSince, status, reputationPaused, now, graceHours } = input;

  if (ok) {
    if (!failingSince) return { action: "none" };
    // Only turn sending back on if DNS is why it went off. A tenant paused for
    // bounces stays paused — fixing a TXT record is not evidence their list
    // improved, and a pause anyone can clear by editing DNS is not a pause.
    return { action: "recovered", restoreSending: status === "failed" && !reputationPaused };
  }

  if (!failingSince) return { action: "drifted" };

  const hoursElapsed = (now.getTime() - failingSince.getTime()) / 3_600_000;
  // Already stopped (or never sending): nothing left to escalate to.
  if (status !== "verified") return { action: "grace", hoursElapsed };
  if (hoursElapsed < graceHours) return { action: "grace", hoursElapsed };
  return { action: "suspend" };
}


// ---------------------------------------------------------------------------
// SES-managed DKIM for a customer domain.
//
// We used to generate a keypair per sub-tenant, have the customer publish it as
// a TXT record, verify it, encrypt the private half and rotate it — and then
// never sign anything with it, because SES signs with Easy DKIM on OUR verified
// domain. So `d=` was ours, DMARC did not align for the customer, and the entire
// key ceremony authenticated nothing.
//
// The fix is not to sign it ourselves. SES will not accept a From address whose
// domain is not a verified identity in the account, so a customer domain has to
// be registered with SES regardless — and once it is, Easy DKIM signs as THAT
// domain and Amazon manages the keys and their rotation. Three CNAMEs replace
// our TXT record and the customer's mail is finally signed as their own.
// ---------------------------------------------------------------------------

/** The three CNAMEs SES asks a domain owner to publish for Easy DKIM. */
export function sesDkimRecords(domain: string, tokens: readonly string[]): DnsRecord[] {
  return tokens.map((t) => ({
    purpose: "dkim" as const,
    type: "CNAME" as const,
    host: `${t}._domainkey.${domain}`,
    value: `${t}.dkim.amazonses.com`,
    // Required: without these the domain cannot send at all, because SES will
    // not verify the identity and will refuse the From address.
    required: true,
  }));
}
