"use client";

import { useId, useState } from "react";
import { Metric } from "@rootmail/design";
import { CodeBlock } from "./code-block";
import { Segmented } from "./controls";

/**
 * D4 — ONE INTEGRATION, A BRANCH PER CUSTOMER.
 * `docs/design/04-EXPERIENCE.md` §8.4.
 *
 * WHAT THE OWNER SAID, AND WHY THIS IS A REBUILD RATHER THAN A TIDY-UP
 * (2026-08-31):
 *
 *   "the way we are presenting the information … after one creates the tenant,
 *    second hand the DNS records, and there's a box that says 'switch identity'
 *    below, and DKIM selector and the reputation switch with it — it feels
 *    disconnected. And then below it you see 'as a platform, as your customer'
 *    — we just have two distinct boxes, that is a bit confusing. It doesn't
 *    really talk to one information, it still feels distinct, not really
 *    showing a cohesive information."
 *
 * The diagnosis was exact. The section was FOUR containers on one grid — a code
 * block, a tab strip, a definition list, a DNS table — and the only thing
 * asserting a relationship between them was a sentence in the section head
 * ("Switch identity below and the From address, the DKIM selector and the
 * reputation switch with it"). Worse, the tab strip governed one of the four:
 * switching identity changed the little `dl` and left the code and the DNS
 * table sitting on a different customer's domain, which is precisely how four
 * boxes come to read as four unrelated facts.
 *
 * THE FIX IS THE DRAWING, NOT THE COPY. The product's claim here is a shared
 * trunk with a branch per client, so the artifact is now literally that: one
 * container, one platform row across the top, and a SPINE descending from it
 * with a tick out to every beat that hangs off it (`.branch-tree` /
 * `.branch-node` in `globals.css`). Picking a branch moves the whole story —
 * the `sendingDomain` in the call, every host in the DNS table, the From
 * address, the DKIM selector, the 7-day rates and the sending state. One
 * control, one subject, one continuous explanation. There is nothing left for
 * a sentence to have to connect.
 *
 * EVERY VALUE BELOW IS THE REAL SHAPE.
 * - The records are what `buildDnsRecords()` in `packages/core/src/dns.ts`
 *   emits for a sub-tenant: `_rootmail.<domain>` for ownership,
 *   `<selector>._domainkey.<domain>` for DKIM with `DKIM_SELECTOR` defaulting
 *   to `rootmail`, an SPF include on `spf.<ROOTMAIL_DOMAIN>`, and a
 *   monitor-only DMARC. Two of the four are `required: false` and the table
 *   says which — inventing four mandatory records would make our own
 *   onboarding look worse than it is.
 * - The thresholds are `REPUTATION_THRESHOLDS` in
 *   `packages/core/src/reputation.ts` (`warn.bounce` 5.00%,
 *   `throttle.complaint` 0.30%) over `REPUTATION_WINDOW_DAYS` = 7.
 * - The throttle rate is `REPUTATION_THROTTLE_PER_HOUR` = 60, and "metered,
 *   not dropped" is what `reputationGate()` in `apps/worker/src/pipeline.ts`
 *   does: a throttled tenant's message is re-queued into the next window.
 *
 * WHAT THIS SECTION IS CAREFUL NOT TO CLAIM. Cliffside is over the complaint
 * line and the artifact says we throttle THAT BRANCH — which is true, and is
 * what shipped on 2026-08-18. It does NOT say a bad tenant cannot touch another
 * tenant's delivery: every tenant still shares one IP pool and one provider
 * account, so that sentence stays on the "never claim until the code lands"
 * list until per-tenant IP isolation exists. We say what we do — score each
 * branch on its own window, and rate-limit the one that crossed a line.
 */

/** The platform doing the integrating. One key, one webhook, one integration. */
const PLATFORM = {
  domain: "harbourbookings.com",
  from: "notifications@harbourbookings.com",
  bounce: "0.9%",
  complaint: "0.04%",
};

type Branch = {
  id: string;
  label: string;
  name: string;
  domain: string;
  externalId: string;
  from: string;
  bounce: string;
  complaint: string;
  /** What the sweep did about it, in the words the worker uses. */
  sending: string;
  /** `acted` = we took an action. Never `witnessed` — that is reserved for
   *  what happened to a message, and a throttle is what happened to a sender. */
  throttled: boolean;
};

const BRANCHES: readonly Branch[] = [
  {
    id: "sunset",
    label: "Sunset Villas",
    name: "Sunset Villas",
    domain: "sunsetvillas.com",
    externalId: "customer_8821",
    from: "bookings@sunsetvillas.com",
    bounce: "0.6%",
    complaint: "0.02%",
    sending: "sending · within limits",
    throttled: false,
  },
  {
    id: "cliffside",
    label: "Cliffside Retreats",
    name: "Cliffside Retreats",
    domain: "cliffsideretreats.com",
    externalId: "customer_9134",
    from: "stays@cliffsideretreats.com",
    bounce: "1.8%",
    complaint: "0.31%",
    sending: "throttled · 60 sends an hour · metered, not dropped",
    throttled: true,
  },
] as const;

function callFor(b: Branch): string {
  return `const tenant = await mail.subTenants.create({
  name: "${b.name}",
  sendingDomain: "${b.domain}",
  externalId: "${b.externalId}",
});

// tenant.dns_records → the table beside this one.
await mail.subTenants.verify(tenant.id);`;
}

function recordsFor(domain: string) {
  return [
    { type: "TXT", host: `_rootmail.${domain}`, value: "rootmail-verify=9f3c…", required: true },
    {
      type: "TXT",
      host: `rootmail._domainkey.${domain}`,
      value: "v=DKIM1; k=rsa; p=MIIBIjANBg…",
      required: true,
    },
    { type: "TXT", host: domain, value: "v=spf1 include:spf.rootmail.io ~all", required: false },
    {
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      required: false,
    },
  ];
}

export function SubTenancy() {
  const [which, setWhich] = useState(0);
  const idBase = useId();
  const branch = BRANCHES[which];
  const records = recordsFor(branch.domain);

  return (
    <div>
      <div className="artifact">
        <div className="artifact-head">
          <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
            sub_tenants
          </span>
          <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
            demonstration
          </span>
        </div>

        {/* ── THE TRUNK ───────────────────────────────────────────────────
            Your platform: one key, one webhook, one integration, and one
            reputation of its own. The spine below descends from this row. */}
        <div className="border-b border-rule px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <p className="text-[13px] text-ink-muted">your platform</p>
              <p className="mt-1 min-w-0 truncate font-mono text-[15px] text-foreground" data-fact>
                {PLATFORM.domain}
              </p>
              <p className="mt-1.5 text-[13px] text-ink-muted">
                one API key · one webhook · one integration
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Metric
                value={PLATFORM.bounce}
                label="bounces"
                window="7d"
                method="provider feedback"
                threshold="warn at 5.00%"
                size="sm"
              />
              <Metric
                value={PLATFORM.complaint}
                label="complaints"
                window="7d"
                method="provider feedback"
                threshold="throttle at 0.30%"
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* ── THE BRANCHES ────────────────────────────────────────────────
            Everything from here down hangs off the spine, and everything from
            here down is about ONE branch — the one picked in the first node.
            Three nodes, three ticks: who, the exchange that onboards them, and
            what they become. `--branch-tail` matches the container's bottom
            padding so the spine ends with the branch's own content rather than
            running on into the frame. */}
        <div
          className="branch-tree py-5 pr-4 sm:pr-5"
          style={{ "--branch-tail": "1.25rem" } as React.CSSProperties}
        >
          <div className="branch-node">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[13px] text-ink-muted">their domain</span>
              <Segmented
                options={BRANCHES}
                active={which}
                onChange={setWhich}
                label="Customer"
                idBase={idBase}
              />
            </div>
          </div>

          <div id={`${idBase}-panel-${branch.id}`} aria-labelledby={`${idBase}-tab-${branch.id}`}>
            {/* One node, two halves: the call you make and the table it hands
                back. They are one exchange, so they share one tick. */}
            <div className="branch-node mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
              <div className="min-w-0">
                <Beat n="01" note="one request">
                  you call
                </Beat>
                <CodeBlock code={callFor(branch)} filename="onboard.ts" className="mt-2" />
              </div>

              <div className="min-w-0">
                <Beat n="02" note="paste into your own onboarding UI">
                  they publish
                </Beat>
                <div className="ruled mt-2 overflow-hidden rounded-lg bg-well shadow-well">
                  {records.map((r) => (
                    <div key={r.host} className="px-3 py-2 font-mono text-[12.5px]">
                      {/* `break-all`, not `truncate`. The host is the thing a
                          reader has to type into a DNS panel; at 375px inside
                          the tree's gutter it does not fit on one line, and an
                          ellipsis in the middle of a DKIM selector is a value
                          we have withheld. Two lines is not a defect. */}
                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0 text-ink-muted">{r.type}</span>
                        <span className="min-w-0 break-all text-foreground" data-fact>
                          {r.host}
                        </span>
                        <span className="ml-auto shrink-0 text-ink-muted">
                          {r.required ? "required" : "optional"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-ink-muted" data-fact>
                        {r.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Beat 03 is the payoff and it is why the two columns above are
                worth reading: once those records resolve, the branch is a sender
                in its own right — its own envelope, its own signing key, its own
                score, and its own answer from the enforcement sweep. */}
            <div className="branch-node mt-6">
              <Beat n="03" note={`${branch.domain} · its own key, its own score`}>
                and then they are their own sender
              </Beat>
              <dl className="ruled mt-2 rounded-lg bg-well px-3 shadow-well">
                <div className="flex gap-3 py-2 font-mono text-[12.5px]">
                  <dt className="w-16 shrink-0 text-ink-muted">From</dt>
                  <dd className="min-w-0 break-all" data-fact>
                    {branch.from}
                  </dd>
                </div>
                <div className="flex gap-3 py-2 font-mono text-[12.5px]">
                  <dt className="w-16 shrink-0 text-ink-muted">DKIM</dt>
                  <dd className="min-w-0 break-all" data-fact>
                    rootmail._domainkey.{branch.domain}
                  </dd>
                </div>
                <div className="flex flex-wrap items-end gap-x-8 gap-y-4 py-3">
                  <Metric
                    value={branch.bounce}
                    label="bounces"
                    window="7d"
                    method="provider feedback"
                    threshold="warn at 5.00%"
                    size="sm"
                  />
                  <Metric
                    value={branch.complaint}
                    label="complaints"
                    window="7d"
                    method="provider feedback"
                    threshold="throttle at 0.30%"
                    size="sm"
                  />
                  <div className="min-w-0 pb-1">
                    <dt className="sr-only">Sending</dt>
                    <dd
                      className={
                        branch.throttled
                          ? "font-mono text-[12.5px] text-acted"
                          : "font-mono text-[12.5px] text-ink-muted"
                      }
                      data-fact
                    >
                      {branch.sending}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* The sourcing line, in the same place and the same face D3 puts its
          own. A three-line disclosure inside the head made the head the
          tallest thing in the artifact at 375px, and it belongs under the
          record it sources rather than on top of it. */}
      <p className="mt-3 font-mono text-[12.5px] text-ink-muted" data-fact>
        these two clients are invented · the record shapes, thresholds and throttle rate are the
        real ones
      </p>

      {/* The claim, stated once, in the words the code can back. */}
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">
        Every branch is scored on its own trailing 7 days. Cross a line — Cliffside is over the
        complaint threshold — and a 15-minute sweep throttles{" "}
        <span className="text-foreground">that branch</span>, sixty sends an hour, re-queued rather
        than dropped, while the rest of your platform keeps sending at full rate.
      </p>
    </div>
  );
}

/**
 * A beat on the spine. Mono, because `01` is an ordinal we are recording, and
 * the `note` is a sourcing line — where the thing under it came from or goes.
 */
function Beat({ n, note, children }: { n: string; note?: string; children: React.ReactNode }) {
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[12.5px] text-ink-muted"
      data-fact
    >
      <span className="text-foreground">{n}</span>
      {children}
      {note ? <span className="min-w-0 truncate">· {note}</span> : null}
    </p>
  );
}
