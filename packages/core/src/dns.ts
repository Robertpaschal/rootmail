import { resolveTxt } from "node:dns/promises";
import { env } from "./env";

export type DnsRecordPurpose = "ownership" | "dkim" | "spf" | "dmarc";

export interface DnsRecord {
  purpose: DnsRecordPurpose;
  type: "TXT";
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
}

/** The DNS records a sub-tenant must publish to verify + authenticate their domain. */
export function buildDnsRecords(input: BuildDnsInput): DnsRecord[] {
  const { domain, verificationToken, dkimSelector, dkimValue } = input;
  return [
    {
      purpose: "ownership",
      type: "TXT",
      host: `_rootmail.${domain}`,
      value: `rootmail-verify=${verificationToken}`,
      required: true,
    },
    {
      purpose: "dkim",
      type: "TXT",
      host: `${dkimSelector}._domainkey.${domain}`,
      value: dkimValue,
      required: true,
    },
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
}

const stripWs = (s: string) => s.replace(/\s+/g, "");

function matches(record: DnsRecord, txtValues: string[]): boolean {
  switch (record.purpose) {
    case "ownership":
      return txtValues.some((v) => stripWs(v) === stripWs(record.value));
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
        const txts = await resolveTxt(record.host);
        const flat = txts.map((chunks) => chunks.join(""));
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
