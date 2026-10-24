/**
 * The label for one row of a recipient's send history ("More to …" on the
 * message page).
 *
 * The panel used to print the raw stored status, capitalised. That is fine for
 * most statuses, but a send blocked BEFORE it left us (status "suppressed")
 * printed "Suppressed" next to rows that really bounced — and read as one more
 * failed delivery. It never reached a provider, so it says so.
 *
 * Every other status keeps its previous wording exactly (capitalised raw value),
 * so real bounces still read "Bounced".
 */
const OVERRIDES: Record<string, string> = {
  suppressed: "Not sent (suppressed)",
};

export function sendHistoryLabel(status: string): string {
  const override = OVERRIDES[status];
  if (override) return override;
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Where the stop on a message's line came from. A suppression block happens
 * before any provider is involved, so "provider feedback" was a false claim.
 */
export function stopMethod(status: string): string {
  return status === "suppressed" ? "blocked before sending" : "provider feedback";
}
