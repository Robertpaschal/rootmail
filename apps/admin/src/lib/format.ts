/** Human date, e.g. "Jun 17, 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Date + time, e.g. "Jun 17, 2026, 3:04 PM". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Thousands-separated integer. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
