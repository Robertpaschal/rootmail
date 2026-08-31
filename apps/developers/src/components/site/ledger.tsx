"use client";

import { useEffect, useState } from "react";
import { Line, type StationState } from "@rootmail/design";
import { QuietButton } from "./controls";
import { cn } from "@/lib/utils";

/**
 * D2 — THE EVENT LEDGER. `docs/design/04-EXPERIENCE.md` §8.4.
 *
 * This is the section that replaces `code-showcase.tsx`'s "Audit trail" tab,
 * and replacing it was the most urgent thing on this site. That tab printed
 *
 *     10:01:30  opened
 *
 * in a flat list at the identical weight as `delivered` — which is
 * `01-REFERENCES.md` §4's "founding lie of the category", shipping on the one
 * page whose entire job is to differentiate us from it. An open is a tracking
 * pixel firing and roughly a third of them are a mail client prefetching an
 * image. Here `opened` and `clicked` carry a HOLLOW node, `delivered` a filled
 * one, and a bounce is a bar rather than a dot — drawn by `<Line>` from
 * `@rootmail/design`, so the rendering law is enforced by the same component
 * the dashboard uses and cannot drift out of agreement with it.
 *
 * THE SECOND DIFFERENCE, which no competitor's ledger can copy: tenant events
 * are in the same stream. `tenant_throttled`, `tenant_dns_drifted` and
 * `dkim_rotation_started` are real members of `AUDIT_EVENTS` in
 * `packages/core/src/constants.ts` — one append-only trail, so "we throttled
 * your client" is recorded beside "we delivered their mail". The filter exists
 * so a developer can isolate them in one click, which is worth more than a
 * paragraph naming them.
 *
 * MOTION, AND WHY THIS IS A ROLLING WINDOW (Law 1)
 * The obvious build — start empty, push rows in on a timer — makes twelve rows
 * of content conditional on twelve timer ticks. Instead the window is ALWAYS
 * twelve rows: the server renders the first twelve, and each tick advances the
 * window by one, so a new row enters at the top and the oldest leaves the
 * bottom. Nothing is ever revealed by motion, because nothing is ever absent;
 * with JavaScript off, or timers frozen, the visitor reads twelve complete
 * rows.
 *
 * `prefers-reduced-motion` (Law 2) does not merely stop the advance — it drops
 * the window and renders EVERY event as a static row, because the law is that
 * the same information is reached by a non-animated route, not that the
 * animation is skipped. Replay is hidden there; it would be a control over a
 * list that is already whole.
 */

type Kind = "message" | "tenant";

interface Event {
  t: string;
  /** Verbatim from `AUDIT_EVENTS`. Nothing here is invented. */
  event: string;
  kind: Kind;
  /** How the node draws. The law, not a style choice. */
  node: StationState;
  /** Amber marks an intervention — something rootmail DID, not something it
   *  merely saw. `--acted` is spoken for by exactly this (philosophy §9.7). */
  acted?: boolean;
  detail: string;
}

const WINDOW = 12;
const TICK_MS = 1500;

const EVENTS: Event[] = [
  { t: "09:14:02", event: "queued", kind: "message", node: "witnessed", detail: "msg_8haa… · api_key" },
  { t: "09:14:02", event: "sending", kind: "message", node: "witnessed", detail: "msg_8haa… · provider ses" },
  { t: "09:14:03", event: "sent", kind: "message", node: "witnessed", detail: "msg_8haa… · provider accepted" },
  { t: "09:14:07", event: "delivered", kind: "message", node: "witnessed", detail: "msg_8haa… · guest@test.rootmail.dev" },
  { t: "09:41:55", event: "opened", kind: "message", node: "inferred", detail: "msg_8haa… · tracking pixel · undercounts blocked images" },
  { t: "09:42:10", event: "clicked", kind: "message", node: "inferred", detail: "msg_8haa… · redirect recorded" },
  { t: "10:01:30", event: "tenant_warned", kind: "tenant", node: "witnessed", acted: true, detail: "harbourclinic.com · complaints 0.12% · warn at 0.10%" },
  { t: "10:12:44", event: "bounced", kind: "message", node: "stopped", detail: "msg_iq3q… · 550 5.1.1 mailbox unavailable" },
  { t: "10:12:44", event: "suppressed", kind: "message", node: "stopped", detail: "msg_iq3q… · added to the suppression list" },
  { t: "10:31:09", event: "tenant_throttled", kind: "tenant", node: "witnessed", acted: true, detail: "harbourclinic.com · 60/hour · complaints 0.31% · throttle at 0.30%" },
  { t: "11:02:18", event: "tenant_dns_drifted", kind: "tenant", node: "witnessed", acted: true, detail: "northlakegym.com · DKIM stopped resolving · 6h grace" },
  { t: "11:20:55", event: "dkim_rotation_started", kind: "tenant", node: "witnessed", acted: true, detail: "sunsetvillas.com · selector rootmail-202608 published" },
  // ---- past the resting window: these arrive as the stream advances --------
  { t: "11:48:02", event: "retried", kind: "message", node: "witnessed", detail: "msg_iq3q… · attempt 2" },
  { t: "12:03:41", event: "failed", kind: "message", node: "stopped", detail: "msg_thce… · deferred 26 times · gave up" },
  { t: "12:15:00", event: "tenant_dns_recovered", kind: "tenant", node: "witnessed", detail: "northlakegym.com · DKIM resolving again" },
  { t: "12:41:19", event: "complained", kind: "message", node: "stopped", detail: "msg_thce… · provider feedback loop" },
  { t: "13:02:07", event: "unsubscribed", kind: "message", node: "witnessed", detail: "msg_8haa… · one-click list-unsubscribe" },
  { t: "13:30:44", event: "tenant_resumed", kind: "tenant", node: "witnessed", acted: true, detail: "harbourclinic.com · complaints 0.06% · resumed" },
  { t: "13:52:10", event: "contacts_imported", kind: "tenant", node: "witnessed", detail: "sunsetvillas.com · 1,204 contacts · permission affirmed" },
  { t: "14:02:11", event: "dkim_rotation_completed", kind: "tenant", node: "witnessed", acted: true, detail: "sunsetvillas.com · old selector retires in 7 days" },
  // A SECOND message walks its lifecycle at the tail, and it is here for one
  // reason: the hollow `opened` node is this section's whole argument, and a
  // rolling window that ends on eight tenant events would have scrolled the only
  // hollow node on the page off the bottom by the time the stream stopped. The
  // resting twelve contain one and so do the final twelve. (It is also what a
  // real ledger looks like — mail does not stop arriving because a DKIM key
  // rotated.)
  { t: "14:11:03", event: "queued", kind: "message", node: "witnessed", detail: "msg_pk8w… · api_key" },
  { t: "14:11:04", event: "sent", kind: "message", node: "witnessed", detail: "msg_pk8w… · provider accepted" },
  { t: "14:11:09", event: "delivered", kind: "message", node: "witnessed", detail: "msg_pk8w… · guest@test.rootmail.dev" },
  { t: "14:26:52", event: "opened", kind: "message", node: "inferred", detail: "msg_pk8w… · tracking pixel · undercounts blocked images" },
  { t: "14:31:18", event: "clicked", kind: "message", node: "inferred", detail: "msg_pk8w… · redirect recorded" },
];

const FILTERS = [
  { id: "all", label: "all", match: () => true },
  { id: "message", label: "message events", match: (e: Event) => e.kind === "message" },
  { id: "tenant", label: "tenant events", match: (e: Event) => e.kind === "tenant" },
] as const;

export function Ledger() {
  const [filter, setFilter] = useState(0);
  const [cursor, setCursor] = useState(WINDOW);
  const [streaming, setStreaming] = useState(false);
  const [reduced, setReduced] = useState(false);

  const rows = EVENTS.filter(FILTERS[filter].match);
  const end = Math.min(Math.max(cursor, Math.min(WINDOW, rows.length)), rows.length);
  // LAW 2, and it is not "the animation is skipped". A reader who has asked for
  // reduced motion must reach the SAME INFORMATION by a non-animated route — so
  // the window is dropped entirely and every event the stream would have walked
  // through is rendered as a static row. Twelve rows plus a control they will
  // never press would have hidden thirteen events from exactly the people who
  // cannot get them back.
  const visible = reduced ? rows : rows.slice(Math.max(0, end - WINDOW), end);
  const done = end >= rows.length;

  // The advance is a `setInterval`, never a `requestAnimationFrame` loop:
  // timers keep firing in a hidden tab and in the browser preview pane, where
  // frames do not. Nothing depends on it either way — see the header comment.
  useEffect(() => {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    setStreaming(true);
  }, []);

  useEffect(() => {
    if (!streaming || done) return;
    const id = setInterval(() => setCursor((c) => c + 1), TICK_MS);
    return () => clearInterval(id);
  }, [streaming, done, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter events" className="flex flex-wrap gap-px">
          {FILTERS.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={i === filter}
              onClick={() => {
                setFilter(i);
                setCursor(WINDOW);
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-interaction ease-interaction",
                i === filter
                  ? "bg-foreground text-background"
                  : "text-ink-muted hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {streaming && done ? (
          <QuietButton onClick={() => setCursor(WINDOW)}>Replay</QuietButton>
        ) : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-rule bg-card shadow-e1">
        {/* NO CAPTION UNDER THIS. An earlier draft carried a mono
            "demonstration · sample data" line here, and the owner removed it
            along with the site's line legend: a disclaimer under every artifact
            reads as an apology for the artifact, and a legend you have to
            consult is a design that failed to explain itself. What replaced it
            is the sentence directly beneath the table — "the hollow node is an
            open" — which explains the one thing a reader can actually be
            confused by, at the point they meet it. Do not reintroduce either. */}
        <ol className="ruled">
        {visible
          .slice()
          .reverse()
          .map((e) => (
            <li
              key={`${e.t}-${e.event}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 font-mono text-[12px] sm:flex-nowrap"
            >
              <span className="w-[52px] shrink-0 text-ink-muted" data-fact>
                {e.t}
              </span>
              <span className="inline-flex shrink-0 translate-y-[3px] items-center">
                <Line stations={[{ label: e.event, state: e.node }]} />
              </span>
              <span
                className={cn(
                  "w-[168px] shrink-0",
                  e.acted && "text-acted",
                  e.node === "stopped" && "text-stopped",
                  e.node === "inferred" && "text-ink-muted",
                )}
              >
                {e.event}
              </span>
              <span className="min-w-0 truncate text-ink-muted" data-fact>
                {e.detail}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="max-w-md text-sm text-ink-muted">
          The hollow node is an open — a pixel fired, and mail clients prefetch images.
        </p>
        <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
          Rootmail-Signature · HMAC-SHA256 of timestamp + raw body
        </p>
      </div>
    </div>
  );
}
