import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChangeFeed } from "@/components/app/change-feed";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { loadChanges, quietSentence } from "@/lib/changes";
import {
  DNS_DRIFT_GRACE_HOURS,
  REPUTATION_MIN_VERDICTS,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
} from "@/lib/reputation";

export const metadata = { title: "What changed · rootmail" };

/**
 * The destination the nav did not have.
 *
 * Every other route in this product is an OBJECT TYPE — messages, campaigns,
 * contacts, templates. Thirteen of fifteen. Meanwhile the system throttles
 * senders, pauses them, re-checks DNS hourly and sweeps reputation on a
 * schedule, and there was nowhere to go and read what it had done.
 * `docs/design/00-PHILOSOPHY.md` §8 measures the day-30 product by exactly one
 * sentence: *the operator has never once been surprised by an email problem
 * they learned about from their own customer.* This page is where that promise
 * is kept or broken.
 *
 * The overview carries the same feed, cut to five. This is the whole of it,
 * with the standing rules printed underneath — because "what we did" is only
 * trustworthy next to "what we always do".
 */
export default async function ActivityPage() {
  const { changes, unreachable, clientsAvailable } = await loadChanges(30);

  if (unreachable) {
    return (
      <>
        <PageHeader title="What changed" />
        <ConnectionErrorCard message="We couldn't reach your data just now." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="What changed"
        description="Everything rootmail noticed and everything it did about it, newest first — each with the number that caused it and the way to fix it."
      />

      <ChangeFeed changes={changes} quiet={quietSentence(changes.length > 0)} />

      {/* The standing rules. A record of interventions means nothing without the
          thresholds they are measured against — and these are the real
          constants the worker enforces on, imported rather than retyped. */}
      <section className="mt-10 border-t pt-6">
        <h2 className="text-sm font-medium">What we are doing while you are not looking</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Rule
            term="Reputation sweep"
            def={`Bounce and complaint rates per client, over a rolling ${REPUTATION_WINDOW_DAYS} days. A client crossing warn is flagged, then metered to ${REPUTATION_THROTTLE_PER_HOUR} messages an hour, then stopped. Nothing is enforced below ${REPUTATION_MIN_VERDICTS} judged sends.`}
            href="/deliverability"
            hrefLabel="Deliverability"
          />
          <Rule
            term="DNS re-check"
            def={`Every client's records, every hour. If one disappears you hear it from us within the hour, with a ${DNS_DRIFT_GRACE_HOURS}-hour grace before anything is suspended.`}
            href={clientsAvailable ? "/sub-tenants" : "/billing"}
            hrefLabel={clientsAvailable ? "Client domains" : "Plan & usage"}
          />
          <Rule
            term="Suppression"
            def="Every bounce, complaint and unsubscribe is written to the suppression list at the moment it is reported, and the send pipeline checks that list before it renders anything."
            href="/deliverability"
            hrefLabel="Suppression list"
          />
          <Rule
            term="The record"
            def="Every message keeps an append-only trail of what happened to it, with the provider that reported each step. Nothing in it is ever rewritten — corrections are new entries."
            href="/compliance"
            hrefLabel="Proof & compliance"
          />
        </dl>
      </section>
    </>
  );
}

function Rule({
  term,
  def,
  href,
  hrefLabel,
}: {
  term: string;
  def: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div>
      <dt className="text-sm font-medium">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {def}{" "}
        <Link href={href} className="whitespace-nowrap font-medium text-foreground hover:underline">
          {hrefLabel} <ArrowRight className="inline size-3" />
        </Link>
      </dd>
    </div>
  );
}
