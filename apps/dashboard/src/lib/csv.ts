/**
 * Pragmatic CSV helpers shared by the contact importer (Audience hub) and the
 * suppressions importer (Deliverability). Handles the simple comma-separated
 * exports the big providers produce (optionally quoted cells) — not a full RFC
 * 4180 parser, and that's fine for these flows.
 */

export function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
}

export interface CsvEntry {
  email: string;
  name?: string;
  reason?: string;
}

/** Detect the email (and name/reason) columns and pull clean entries. */
export function extractEntries(csv: string, kind: "contacts" | "suppressions"): CsvEntry[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const first = rows[0].map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => c.includes("email") || c.includes("address"));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const emailCol = hasHeader ? first.findIndex((c) => c.includes("email") || c.includes("address")) : 0;
  const reasonCol = hasHeader ? first.findIndex((c) => /reason|type|status|event/.test(c)) : -1;
  const nameCol = hasHeader ? first.findIndex((c) => c.includes("name") && !c.includes("email")) : -1;

  const out: CsvEntry[] = [];
  for (const r of dataRows) {
    const email = (r[emailCol] ?? "").trim();
    if (!email.includes("@")) continue;
    out.push(
      kind === "suppressions"
        ? { email, reason: reasonCol >= 0 ? r[reasonCol] : undefined }
        : { email, name: nameCol >= 0 ? r[nameCol] : undefined },
    );
  }
  return out;
}
