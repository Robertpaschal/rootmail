/**
 * "WHAT DOES AN ORDINARY DAY LOOK LIKE?" — new, 2026-08-31.
 *
 * The owner named two questions the old page answered and the rewritten one
 * did not: **who is it for**, and **what another Tuesday looks like**. This is
 * the second. It exists because every other section on this page is an
 * argument, and a stranger deciding whether to sign up is not weighing an
 * argument — they are trying to picture themselves using the thing.
 *
 * ── WHY A DAY, RATHER THAN A FEATURE LIST ───────────────────────────────────
 * A feature list makes the reader assemble the product in their head. A day
 * hands it to them assembled, and it carries the differentiators *sideways*,
 * where they land as ordinary competence rather than as boasting:
 *
 *   06:00  scheduled campaigns
 *   09:14  transactional send through the API, four seconds end to end
 *   11:47  shared reply inbox, and a sequence that exits on reply
 *   14:20  automatic suppression on a hard bounce
 *   16:05  SCOPED unsubscribe — the doctrine COLLAB.md lists as unmentioned
 *          anywhere public, shipped and never claimed
 *   22:00  hourly DNS re-checks, with the latency in the sentence
 *
 * The last row is the one to keep: the ordinary day ends with nothing
 * happening, and saying so is more honest than inventing a crisis.
 *
 * ── EVERY ROW IS TRUE, AND HERE IS WHERE ────────────────────────────────────
 * - the reply exit: `sequence_exited_on_reply`, worker sequence step guard.
 * - the bounce → suppression: the send pipeline suppresses before the next
 *   send; `packages/db/suppression.ts` and its tests.
 * - the scoped unsubscribe: suppression rows carry a scope, and the marketing
 *   scope does not stop a transactional message. This is the row in
 *   `promises.tsx` too, said there as a comparison and here as a Tuesday.
 * - "within the hour": `DNS_RECHECK_INTERVAL_MINUTES = 60`, and the drift path
 *   both sends mail and fires a `tenant.dns_drifted` webhook
 *   (`apps/worker/src/dns-drift.ts`). `docs/COLLAB.md` (Cowork, 18 Aug) says
 *   explicitly: ship this claim WITH the latency in it, never without.
 *
 * ── THE LAWS ────────────────────────────────────────────────────────────────
 * Server component, no state, no motion beyond `.rise` (scroll-driven,
 * transform-only, behind `@supports`; failure mode is a row fourteen pixels
 * low). Times are recorded values, so they are mono; everything else is prose,
 * so it is not. Nothing here is a number a reader cannot interpret — the only
 * figures are a clock and a subscriber count on an example newsletter.
 */

type Beat = {
  at: string;
  what: string;
  /** Who had to do something. `you` or `nobody` — the argument of the section. */
  by: "you" | "rootmail";
};

const DAY: Beat[] = [
  {
    at: "06:00",
    by: "rootmail",
    what: "The morning newsletter goes out to 4,812 subscribers. You wrote it yesterday afternoon and scheduled it before you left.",
  },
  {
    at: "09:14",
    by: "rootmail",
    what: "A customer books a room. Your website asks rootmail for the confirmation email, and it is in her inbox four seconds later, from your address.",
  },
  {
    at: "11:47",
    by: "you",
    what: "She replies to ask about a late checkout. It lands in the shared inbox with the original underneath it, and whoever is on duty answers. The follow-up email queued for her tomorrow cancels itself.",
  },
  {
    at: "14:20",
    by: "rootmail",
    what: "One address on the newsletter no longer exists, and the mail bounces. rootmail puts it on your do-not-send list the same second, so you never mail it again and it never counts against you twice.",
  },
  {
    at: "16:05",
    by: "rootmail",
    what: "Somebody unsubscribes from the newsletter. They keep getting their receipts and their password resets — an unsubscribe stops marketing, not the email they asked for.",
  },
  {
    at: "22:00",
    by: "rootmail",
    what: "Nothing happens, which is the point. rootmail re-checks the DNS records behind your domain every hour; if one of them had disappeared, you would have had an email from us within the hour and six hours to put it back before anything stopped.",
  },
];

const BY_LABEL: Record<Beat["by"], string> = {
  you: "you answered it",
  rootmail: "nobody had to act",
};

export function ATuesday() {
  return (
    <section id="a-day" className="slab settle lit">
      <div className="container grid gap-10 py-14 md:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <div>
          <div className="lg:sticky lg:top-28">
            <h2 className="display-l text-balance">What an ordinary Tuesday looks like</h2>
            <p className="lead mt-5 max-w-sm text-ink-muted">
              One small business, one day, nothing on fire. This is the whole product at the size
              most people actually use it.
            </p>
            <p className="mt-6 max-w-sm text-[0.9375rem] leading-relaxed text-ink-muted">
              Exactly one of those six needed somebody at a desk: answering Ana. The newsletter
              was written the afternoon before. Everything else is the part you would otherwise
              be doing by hand — or finding out about far too late.
            </p>
          </div>
        </div>

        {/* The tray, with the day lifted out of it in six rows. */}
        <div className="rounded-2xl bg-well p-2 shadow-well sm:p-3">
          <ol className="ruled">
            {DAY.map((b) => (
              <li key={b.at} className="rise flex flex-col gap-2 px-3 py-5 sm:flex-row sm:gap-6">
                <div className="flex shrink-0 items-baseline gap-3 sm:w-32 sm:flex-col sm:gap-1.5">
                  <span className="display-num text-[1.25rem] leading-none" data-fact>
                    {b.at}
                  </span>
                  <span className="text-[12.5px] leading-snug text-ink-muted">
                    {BY_LABEL[b.by]}
                  </span>
                </div>
                <p className="max-w-[64ch] text-[0.9375rem] leading-relaxed">{b.what}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
