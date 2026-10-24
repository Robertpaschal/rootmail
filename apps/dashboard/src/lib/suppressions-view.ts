/**
 * Pure helpers for the read-only suppressed-addresses list on Deliverability.
 * Kept dependency-free so they can be unit-tested with node:test.
 */
export const SUPPRESSION_REASON_LABEL: Record<string, string> = {
  bounce: "Bounce",
  complaint: "Complaint",
  unsubscribe: "Unsubscribe",
  manual: "Manual",
};

export function reasonLabel(reason: string): string {
  return SUPPRESSION_REASON_LABEL[reason] ?? reason;
}

/** Parse ?sup_page= into a safe 1-based page number. */
export function parseSuppressionPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Normalise ?sup_q= (trimmed, capped, empty → undefined). */
export function parseSuppressionQuery(raw: string | undefined): string | undefined {
  const q = (raw ?? "").trim().slice(0, 254);
  return q ? q : undefined;
}

/** Link to a page of the list, preserving the search and anchoring to the section. */
export function suppressionsHref(page: number, q?: string): string {
  const params = new URLSearchParams();
  if (q) params.set("sup_q", q);
  if (page > 1) params.set("sup_page", String(page));
  const s = params.toString();
  return `/deliverability${s ? `?${s}` : ""}#suppressed`;
}

/** "Showing 51–100 of 130" — or null when there's nothing to show. */
export function rangeLabel(page: number, limit: number, shown: number, total: number): string | null {
  if (shown === 0) return null;
  const from = (page - 1) * limit + 1;
  return `${from.toLocaleString("en-US")}–${(from + shown - 1).toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}
