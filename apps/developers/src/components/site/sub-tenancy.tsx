"use client";

import { useId, useState } from "react";
import { Metric } from "@rootmail/design";
import { CodeBlock } from "./code-block";
import { Segmented } from "./controls";
import { Panel, PanelHead } from "./panel";

/**
 * D4 — THE ONBOARDING UI YOU WOULD HAVE BUILT.
 * `docs/design/04-EXPERIENCE.md` §8.4.
 *
 * Creating a customer's sending identity returns the DNS table you were about
 * to build a screen for, so the right-hand panel renders `dns_records` as that
 * table rather than as JSON. Every host and value below is what
 * `buildDnsRecords()` in `packages/core/src/dns.ts` actually emits for a
 * sub-tenant: `_rootmail.<domain>` for ownership, `<selector>._domainkey.` for
 * DKIM with `DKIM_SELECTOR` defaulting to `rootmail`, an SPF include on
 * `spf.<ROOTMAIL_DOMAIN>`, and a monitor-only DMARC. Two of the four are
 * `required: false`, and the table says which — inventing four mandatory
 * records would make our own onboarding look worse than it is.
 *
 * THE TWO STATIONS. Onboarding a customer's domain is a two-step journey and
 * this artifact has always had two columns, so the columns carry their station
 * numbers: `01 create the tenant`, `02 hand them the records`. That is the
 * homepage's D4 shape — no other section on the page is numbered — and it costs
 * four words rather than the sentence that would otherwise have to explain
 * which column happens first.
 *
 * THE TOGGLE is §5.4's trunk-and-branches idea in a developer's vocabulary:
 * the same code, switched between two identities, with a different From
 * address, a different DKIM selector and a DIFFERENT REPUTATION. That is what
 * "each customer gets their own score" means, made into something you switch
 * rather than something you read. The thresholds printed beside each number
 * are `REPUTATION_THRESHOLDS` from `packages/core/src/reputation.ts`, over the
 * real 7-day window.
 */

const DOMAIN = "sunsetvillas.com";

const CALL = `const tenant = await mail.subTenants.create({
  name: "Sunset Villas",
  sendingDomain: "${DOMAIN}",
  externalId: "customer_8821",
});

// tenant.dns_records → the table on the right.
await mail.subTenants.verify(tenant.id);`;

const RECORDS = [
  { type: "TXT", host: `_rootmail.${DOMAIN}`, value: "rootmail-verify=9f3c…", required: true },
  {
    type: "TXT",
    host: `rootmail._domainkey.${DOMAIN}`,
    value: "v=DKIM1; k=rsa; p=MIIBIjANBg…",
    required: true,
  },
  { type: "TXT", host: DOMAIN, value: "v=spf1 include:spf.rootmail.io ~all", required: false },
  {
    type: "TXT",
    host: `_dmarc.${DOMAIN}`,
    value: `v=DMARC1; p=none; rua=mailto:dmarc@${DOMAIN}`,
    required: false,
  },
];

const IDENTITIES = [
  {
    id: "platform",
    label: "as your platform",
    from: "notifications@harbourbookings.com",
    selector: "rootmail._domainkey.harbourbookings.com",
    bounce: "0.9%",
    complaint: "0.04%",
  },
  {
    id: "customer",
    label: "as your customer",
    from: `bookings@${DOMAIN}`,
    selector: `rootmail._domainkey.${DOMAIN}`,
    bounce: "2.4%",
    complaint: "0.31%",
  },
] as const;

export function SubTenancy() {
  const [who, setWho] = useState(0);
  const idBase = useId();
  const id = IDENTITIES[who];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <div>
        <Station n="01">create the tenant</Station>
        <CodeBlock code={CALL} filename="onboard.ts" />
        <div className="mt-4">
          <Segmented
            options={IDENTITIES}
            active={who}
            onChange={setWho}
            label="Sending identity"
            idBase={idBase}
          />
          <dl
            className="ruled mt-3 rounded-lg border border-rule bg-card px-3 font-mono text-[12px] shadow-e1"
            id={`${idBase}-panel-${id.id}`}
            aria-labelledby={`${idBase}-tab-${id.id}`}
          >
            <div className="flex gap-3 py-2">
              <dt className="w-16 shrink-0 text-ink-muted">From</dt>
              <dd className="min-w-0 truncate" data-fact>
                {id.from}
              </dd>
            </div>
            <div className="flex gap-3 py-2">
              <dt className="w-16 shrink-0 text-ink-muted">DKIM</dt>
              <dd className="min-w-0 truncate" data-fact>
                {id.selector}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 py-3">
              <Metric
                value={id.bounce}
                label="bounces"
                window="7d"
                method="provider feedback"
                threshold="warn at 5.00%"
                size="sm"
              />
              <Metric
                value={id.complaint}
                label="complaints"
                window="7d"
                method="provider feedback"
                threshold="throttle at 0.30%"
                size="sm"
              />
            </div>
          </dl>
        </div>
      </div>

      <div className="self-start">
        <Station n="02">hand them the records</Station>
        <Panel>
        <PanelHead>
          <span>dns_records</span>
          <span>paste into your own onboarding UI</span>
        </PanelHead>
        {/* Say it is a demonstration. This client does not exist and neither
            do its numbers; the RECORD SHAPES are what buildDnsRecords() emits
            and the thresholds are the real ones. */}
        <div className="ruled">
          {RECORDS.map((r) => (
            <div key={r.host} className="px-3 py-2 font-mono text-[12px]">
              <div className="flex items-baseline gap-2">
                <span className="text-ink-muted">{r.type}</span>
                <span className="min-w-0 truncate" data-fact>
                  {r.host}
                </span>
                <span className="ml-auto shrink-0 text-[12.5px] text-ink-muted">
                  {r.required ? "required" : "optional"}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-ink-muted" data-fact>
                {r.value}
              </div>
            </div>
          ))}
        </div>
        </Panel>
      </div>
    </div>
  );
}

/** A station marker. Mono, because `01` is an ordinal we are recording. */
function Station({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-baseline gap-2 font-mono text-[12.5px] text-ink-muted" data-fact>
      <span className="text-foreground">{n}</span>
      {children}
    </p>
  );
}
