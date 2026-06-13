import { resolveTxt } from "node:dns/promises";
import { env } from "./env";

export type DnsRecordPurpose = "ownership" | "dkim" | "spf";

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
