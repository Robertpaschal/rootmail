import type { Station, StationState } from "@rootmail/design";
import type { CheckResult, DomainReport, MechanismResult } from "./types";
import { MECHANISM_LABEL } from "./types";

/**
 * THE MAPPING — `EmailAuthStatus` → the rendering law.
 * `docs/design/00-PHILOSOPHY.md` §3, `04-EXPERIENCE.md` §6.2.
 *
 *   pass     → witnessed   solid node, solid segment.
 *                          We queried the name, the resolver answered, and the
 *                          record says what it needs to say. We saw it.
 *
 *   weak     → witnessed node, DASHED CONTINUATION.
 *                          The record is published — we read it, so the node is
 *                          solid — and it is doing nothing. Every other checker
 *                          on the internet draws this as a green tick because a
 *                          record exists. We draw the node solid and the segment
 *                          LEAVING it dashed, because publication and protection
 *                          are two different claims and only one of them is true.
 *                          This is the whole reason the page exists.
 *
 *   missing  → unknown     dotted, dim. We looked and found nothing. Note that
 *                          for DKIM this is the strongest thing DNS permits:
 *                          selectors cannot be enumerated, so "nothing at the
 *                          names we tried" is not "no DKIM", and the row says so.
 *
 *   blocked  → stopped     the line is severed at a bar and a reason is printed.
 *                          Two things arrive here and the reason distinguishes
 *                          them: a mechanism stopped by a precondition (BIMI with
 *                          DMARC at p=none), and a resolver that did not answer.
 *                          `lookup: "failed"` is the discriminator, and a failed
 *                          lookup NEVER renders as `missing` — "we did not find
 *                          it" and "we could not look" are different claims about
 *                          someone else's infrastructure (§6.4).
 *
 * Where the dash actually comes from: `<Line>` draws each segment in the manner
 * of the station it ARRIVES at, so a dashed continuation is produced by the next
 * station being `unknown`. That is why every row carries its own two-station
 * inline line — `published → doing its job` — which is where a weak mechanism is
 * unmistakable, and why the page-scale line's terminal `enforced` station is
 * `unknown` whenever DMARC is not enforcing.
 */
export function stationState(item: MechanismResult): StationState {
  switch (item.status) {
    case "pass":
      return "witnessed";
    case "weak":
      return "witnessed";
    case "missing":
      return "unknown";
    case "blocked":
      return "stopped";
  }
}

/**
 * The row's own line: did we find it, and is it doing anything?
 *
 * pass     ●───●   found, and working
 * weak     ●╌╌╌○   found, and not working  ← the argument, drawn
 * missing  ○╌╌╌○   not found
 * blocked  |       severed, with the reason
 */
export function rowStations(item: MechanismResult): Station[] {
  const name = MECHANISM_LABEL[item.mechanism];
  if (item.status === "blocked") {
    return [{ label: name, state: "stopped", reason: item.lookup === "failed" ? "could not look" : "stopped" }];
  }
  const published: StationState = item.status === "missing" ? "unknown" : "witnessed";
  const working: StationState = item.status === "pass" ? "witnessed" : "unknown";
  return [
    { label: `${name} published`, state: published },
    { label: `${name} protecting`, state: working },
  ];
}

export function rowLineLabel(item: MechanismResult): string {
  const name = MECHANISM_LABEL[item.mechanism];
  switch (item.status) {
    case "pass":
      return `${name}: published and doing its job.`;
    case "weak":
      return `${name}: published, but not protecting anything.`;
    case "missing":
      return `${name}: nothing found.`;
    case "blocked":
      return item.lookup === "failed"
        ? `${name}: we could not look.`
        : `${name}: stopped before it can take effect.`;
  }
}

/**
 * The page-scale line: the four mechanisms as a chain, ending in the only
 * outcome that matters — whether anything is actually being enforced.
 *
 * `enforced` is `witnessed` only when DMARC is at p=quarantine or p=reject over
 * all mail. Everything short of that leaves it dotted, which is what puts the
 * dashed continuation after a published-but-idle DMARC record.
 */
export function reportStations(report: DomainReport): Station[] {
  // No `at` values on the stations. The rows underneath carry every fact the
  // line carries — that is §6.3's rule, and a recorded value squeezed into a
  // 64px centred label is a value we would have had to abbreviate.
  const stations: Station[] = report.items
    .filter((i) => i.mechanism !== "bimi")
    .map((i) => ({
      label: MECHANISM_LABEL[i.mechanism],
      state: stationState(i),
      reason: i.status === "blocked" ? (i.fact ?? "could not look") : undefined,
    }));

  stations.push({
    label: "enforced",
    state: report.enforced ? "witnessed" : "unknown",
  });
  return stations;
}

/**
 * The line for a result we could not produce.
 *
 * §6.4: on a timeout every station is dotted and the sourcing line says we do
 * not know. An NXDOMAIN is different in kind — the resolver gave us a definite
 * answer — so it severs.
 */
export function unavailableStations(result: Extract<CheckResult, { ok: false }>): Station[] {
  if (result.reason === "no_such_domain") {
    return [{ label: "lookup", state: "stopped", reason: "NXDOMAIN · no such domain" }];
  }
  return ["SPF", "DKIM", "DMARC", "enforced"].map((label) => ({
    label,
    state: "unknown" as const,
  }));
}

/** `2026-08-27 14:02:11 UTC` — the exact instant we looked. */
export function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}
