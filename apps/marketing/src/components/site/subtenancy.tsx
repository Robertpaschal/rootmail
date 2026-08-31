"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * THE WEDGE — `docs/design/04-EXPERIENCE.md` §5.4, now operable.
 *
 * The enforcement half became true on 2026-08-18 (brief P1.1): a per-tenant
 * sweep warns, then throttles at 60 sends/hour, then pauses a client whose
 * numbers go wrong, on a 7-day window with a 20-verdict floor. The DNS half
 * became true in `51c80ed`: every verified domain is re-checked hourly with a
 * six-hour grace before anything is suspended.
 *
 * What is still NOT true, and must never be written here: that one client's
 * mistake cannot reach another's delivery. Sub-tenants share one IP pool and one
 * provider account, and enforcement only starts once a threshold is crossed, so
 * some damage always precedes the throttle.
 *
 * SO THE DISCLOSURE IS A CONSEQUENCE OF THE VISITOR'S OWN ACTION. "Simulate a
 * dirty list" runs a healthy client through the five states the sweep actually
 * moves a tenant through, and at the end a line appears **on the trunk**:
 * `the trunk carried 1,180 of this client's bounces before we stopped it.` No
 * competitor will build a toy that shows you the damage their own architecture
 * lets through, which is exactly why we should. It is the hedging paragraph
 * this section used to carry, delivered as something you did.
 *
 * Three things are true on screen throughout, and they are the section:
 *   1. the other two branches keep counting — that is the claim;
 *   2. the trunk stays 2px and never changes colour — it survived;
 *   3. the damage line appears on the TRUNK, not on the branch.
 *
 * THE THREE LAWS
 * 1. The resting state is the complete argument: three branches, one ok, one
 *    throttled, one severed, every number present, and the five steps rendered
 *    as five static rows under the diagram. A visitor who never clicks — or has
 *    no script — has read all of it. The run is `setInterval`, not
 *    `requestAnimationFrame`, because timers keep firing when frames do not.
 * 2. `prefers-reduced-motion` jumps straight to step 4 in one press. Every
 *    intermediate value it skipped is one of the five static rows.
 * 3. A throttled branch is 1px because it is metered; a paused branch ends in a
 *    bar and nothing is drawn past it. Same law as every other line here.
 *
 * ── THE STORY PASS (2026-08-31) ─────────────────────────────────────────────
 * The owner, reading it cold: *"0.4% sending, 3.5% sending, 6.0% — what are
 * you trying to do? You just show numbers but it's not coherent. You're not
 * telling a story. It makes no content sense."* And on the closing line:
 * *"'Connect your own SES or Mailgun, the mail keeps leaving on your account'
 * — what are you saying? Can you speak in plain English?"*
 *
 * Four changes, none of them to the drawing:
 *
 * 1. **Every figure has a `gloss`, and the type requires it.** `6.0%` now
 *    reads "past 5% — something is wrong with this list", so the reader knows
 *    both what is being measured and why THIS number is the one where
 *    something starts happening.
 * 2. **The measure is named in prose above the ladder** — what a bounce rate
 *    is, and what mail providers read into a rising one.
 * 3. **The statuses are verbs, not jargon.** `warned 03:58` → `we email you`;
 *    `throttled 60/hour` → `slowed to 60 an hour`; `paused 04:12` →
 *    `this client is stopped`.
 * 4. **The provider paragraph is four plain sentences** instead of one
 *    semicolon-joined clause, and it says what "keeps leaving on your account"
 *    was trying to mean: your addresses, your history, and nothing to undo if
 *    you leave.
 */

type Tone = "ok" | "acted" | "stopped";

const TONE = {
  ok: { text: "text-witnessed", bar: "bg-witnessed" },
  acted: { text: "text-acted", bar: "bg-acted" },
  stopped: { text: "text-stopped", bar: "bg-stopped" },
} as const;

/** The ladder rail, same vocabulary the "email fails quietly" rungs use. */
const RAIL: Record<Tone, string> = {
  ok: "border-witnessed",
  acted: "border-acted",
  stopped: "border-stopped",
};

/**
 * The five states the sweep moves a tenant through, in order.
 *
 * `gloss` is REQUIRED and it is why this section reads at all now. The owner,
 * on the version without it: *"0.4% sending, 3.5% sending, 6.0% — what are you
 * trying to do? You just show numbers but it's not coherent. You're not
 * telling a story."* Correct: five percentages climbing, with nothing saying
 * what the percentage measures or why 6.0% is the one where something starts
 * happening, is a chart of a number the reader has never met.
 *
 * The thresholds are `REPUTATION_THRESHOLDS.*.bounce` in
 * `packages/core/src/reputation.ts` — warn 5%, throttle 8%, pause 10% — so
 * each gloss can say which line the figure has just crossed.
 */
const STEPS: Array<{ bounces: string; status: string; gloss: string; tone: Tone }> = [
  { bounces: "0.4%", status: "sending normally", gloss: "a normal list", tone: "ok" },
  { bounces: "3.1%", status: "sending normally", gloss: "climbing, still under the line", tone: "ok" },
  { bounces: "6.0%", status: "we email you", gloss: "past 5% \u2014 something is wrong with this list", tone: "acted" },
  { bounces: "8.4%", status: "slowed to 60 an hour", gloss: "past 8% \u2014 held back, never dropped", tone: "acted" },
  { bounces: "11.2%", status: "this client is stopped", gloss: "past 10% \u2014 everyone else keeps sending", tone: "stopped" },
];

/** The two clients that are not being simulated. Their counts keep moving. */
const OTHERS = [
  { domain: "harbourclinic.com", status: "slowed to 60 an hour", tone: "acted" as Tone, sent: 2318, per: 11 },
  { domain: "northlakegym.com", status: "stopped 04:12", tone: "stopped" as Tone, sent: 940, per: 0 },
];

/**
 * ONE CLIENT, AS A CARD IN THE TRAY.
 *
 * It used to be a flat ruled row with two absolutely-positioned strokes
 * hanging off its left edge. The owner: *"'when you send for other people you
 * inherit their behaviour' is okay, but the way we're presenting the
 * information is still one step lower than where it can be. We can elevate
 * that section."*
 *
 * Measured, the gap was the one the rest of the page had already closed: this
 * section was the only `.slab` on the homepage overpainted with `bg-muted/40`,
 * so it had no sheet, and inside it three clients sat as flat rows on a single
 * undifferentiated plane. Every other comparison on this page — the ladder,
 * the defaults list, the pricing meters, the hero deck — is a pressed tray
 * with the thing that matters lifted out of it. This is that, applied here:
 * the client being simulated is the lifted card, the two that are not are
 * flatter, and the trunk runs down the tray behind all three.
 *
 * The drawing law is unchanged, and it is about a real mechanism: a throttled
 * branch is literally thinner because it is metered, a paused branch ends in a
 * bar and nothing is drawn past it.
 */
function Branch({
  domain,
  status,
  tone,
  detail,
  weight,
  live,
}: {
  domain: string;
  status: string;
  tone: Tone;
  detail: string;
  /** `2` normal, `1` throttled and therefore literally thinner, `0` severed. */
  weight: 0 | 1 | 2;
  /** The one the simulation is moving. It gets the elevation. */
  live?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div className="relative">
      {/* The connector out of the trunk, and the terminal. A severed branch
          gets a shorter stroke and a bar; everything else gets a node. */}
      <span
        aria-hidden="true"
        className={`absolute top-1/2 ${t.bar} ${weight === 1 ? "h-px" : "h-[2px]"} ${
          weight === 0 ? "-left-5 w-3 sm:-left-8 sm:w-5" : "-left-5 w-5 sm:-left-8 sm:w-8"
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute top-1/2 -translate-y-1/2 ${t.bar} ${
          weight === 0 ? "-left-2.5 h-4 w-[3px] rounded-sm" : "-left-3 size-2 rounded-full"
        }`}
      />

      <div
        className={`rounded-xl px-4 py-3.5 ${
          live ? "bg-card shadow-e2" : "bg-card/45"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[13px] font-medium" data-fact>
            {domain}
          </span>
          <span className={`text-[13px] font-medium ${t.text}`}>{status}</span>
          <span className="w-full font-mono text-[12.5px] text-ink-muted sm:ml-auto sm:w-auto" data-fact>
            {detail}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SubTenancy() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setReduced(
      typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);

  const run = useCallback(() => {
    stop();
    if (reduced) {
      setStep(STEPS.length - 1);
      return;
    }
    setStep(0);
    setRunning(true);
    timer.current = window.setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) {
          if (timer.current) window.clearInterval(timer.current);
          timer.current = null;
          setRunning(false);
          return s;
        }
        return s + 1;
      });
    }, 700);
  }, [reduced, stop]);

  const reset = useCallback(() => {
    stop();
    setStep(0);
  }, [stop]);

  const cur = STEPS[step];
  const weight: 0 | 1 | 2 = step === 4 ? 0 : step === 3 ? 1 : 2;
  const dirty = step > 0;

  return (
    <section id="clients" className="slab settle lit lit-edge">
      <div className="container py-14 md:py-24">
        <div className="max-w-3xl">
          <h2 className="display-l text-balance">
            When you send for other people, you inherit their behaviour.
          </h2>
          <p className="lead mt-5 text-ink-muted">
            One of your customers buys a mailing list. Two days later your own mail is landing in
            spam folders and you have no idea which of them caused it.
          </p>
          <p className="mt-5 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
            In rootmail each client sends from their own web address and is measured on their own.
            When one starts going wrong, we email you, then slow that client down, then stop them —
            at four in the morning, without waiting for you to look.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-8">
          <figure className="min-w-0">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <span className="display-s">One account, one branch per client</span>
              <span className="text-[12.5px] text-ink-muted">
                made-up clients, real behaviour · a week compressed into ten seconds
              </span>
            </figcaption>

            {/* The tray. Three client cards lifted out of it, and the trunk
                running down behind all three. */}
            <div className="mt-4 rounded-2xl bg-well p-3 shadow-well sm:p-5">
              <p className="max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
                The thick line is the part everybody shares — one provider account, one set of
                sending addresses, one history built up over months. Each client hangs off it.
                Press the button and watch what happens when one of them uploads a bought list.
              </p>

              <div className="relative mt-5 pl-5 sm:pl-8">
                {/* The trunk. It is shared, it is 2px, and it never changes
                    colour — because it survived, which is the only reason the
                    other two branches are still counting. */}
                <span
                  className="absolute bottom-4 left-0 top-4 w-[2px] rounded-sm bg-foreground"
                  aria-hidden="true"
                />

                <div className="flex flex-col gap-2.5">
                  <Branch
                    domain="sunsetvillas.com"
                    status={cur.status}
                    tone={cur.tone}
                    detail={`${cur.bounces} of their addresses bounced · last 7 days`}
                    weight={weight}
                    live
                  />
                  {OTHERS.map((o) => (
                    <Branch
                      key={o.domain}
                      domain={o.domain}
                      status={o.status}
                      tone={o.tone}
                      detail={`${(o.sent + o.per * step).toLocaleString()} sent · last 7 days`}
                      weight={o.tone === "stopped" ? 0 : 1}
                    />
                  ))}
                </div>
              </div>

              {/* The disclosure, on the trunk, as a consequence of the click. */}
              {step === STEPS.length - 1 ? (
                <p className="mt-5 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
                  We will not pretend that cost nothing: <span className="font-mono" data-fact>1,180</span>{" "}
                  of this client&apos;s bounces went out on the shared account before we stopped
                  them. Everyone shares one account, so some damage always happens before the
                  threshold is crossed. What we can do is notice it in minutes instead of days,
                  and take one client off rather than everybody.
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-4">
                <button
                  type="button"
                  onClick={dirty ? reset : run}
                  className="inline-flex min-h-11 items-center rounded-lg border border-brass-rule bg-brass-tint px-4 text-[13px] font-medium text-brass-text transition-colors duration-interaction ease-interaction hover:border-brass"
                >
                  {dirty ? "Put it back" : "Simulate a dirty list"}
                </button>
                <span
                  className="font-mono text-[12.5px] text-ink-muted"
                  aria-live="polite"
                  data-fact
                >
                  {running ? "running…" : `step ${step} of ${STEPS.length - 1}`}
                </span>
              </div>
            </div>
          </figure>

          {/* The five steps, always present, drawn as the ladder the "email
              fails quietly" section uses — the figure in the display face at
              size, on a rail in its own tone. This is the reduced-motion route
              and the no-script route, and it is the same five figures the
              simulation walks. */}
          <div className="min-w-0">
            <h3 className="display-s text-balance">
              Bounce rate: how many addresses rejected the mail
            </h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              A bought or scraped list is full of addresses that no longer exist. Every one of them
              is a rejection, and mail providers read a rising rejection rate as a sender who does
              not know who their own customers are.
            </p>
            <ol className="mt-5 rounded-2xl bg-well p-2 shadow-well sm:p-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.bounces}
                  className={`rounded-xl border-l-2 py-3 pl-4 ${RAIL[s.tone]} ${
                    i === step ? "bg-card shadow-e1" : ""
                  }`}
                >
                  <p
                    className={`display-num text-[1.5rem] leading-none ${
                      i === step ? TONE[s.tone].text : "text-ink-muted"
                    }`}
                  >
                    {s.bounces}
                  </p>
                  <p
                    className={`mt-1.5 text-[13px] font-medium ${
                      i === step ? TONE[s.tone].text : "text-ink-muted"
                    }`}
                  >
                    {s.status}
                  </p>
                  {/* The plain-English half of every figure. Required by the
                      type, so a step cannot ship as a bare percentage. */}
                  <p className="mt-1 max-w-[34ch] text-[12.5px] leading-snug text-ink-muted">
                    {s.gloss}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-rule pt-3 text-xs leading-relaxed text-ink-muted">
              Counted over the last 7 days, and never on fewer than 20 emails the mail provider
              actually ruled on — so a brand-new client with three sends and one bounce is not
              treated as a 33% failure.
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-center lg:gap-10">
          <div className="max-w-lg">
            <h3 className="display-s text-balance">You keep your own sending account</h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              Already sending through Amazon SES or Mailgun? Keep them. Paste in your credentials
              and your mail still leaves on your account, on your addresses, with the months of
              sending history you have already built up. Disconnect rootmail and nothing has moved:
              you are exactly where you started. If you do not have a provider, use ours.
            </p>
          </div>
          {/* What stays yours. These are plain nouns, not recorded values, so
              they are in the UI face — `00-PHILOSOPHY.md` §10.1: mono marks ids,
              timestamps and sourcing lines, and nothing else. They used to be
              12.5px mono, which read as data the page had measured. */}
          <ul className="grid gap-2 rounded-2xl bg-well p-2 shadow-well sm:grid-cols-2 sm:p-3">
            {[
              "your sending provider — SES, Mailgun, or ours",
              "the sending history you have built up",
              "your domains, and the DNS records on them",
              "the contact mail providers write to about you",
            ].map((k) => (
              <li key={k} className="rounded-xl bg-card/45 px-4 py-3 text-[13px]">
                {k}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-sm text-ink-muted">
          <a
            href="https://developers.rootmail.io/docs"
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
          >
            Setting up a domain is five DNS records. Here they are, in order.
          </a>
        </p>
      </div>
    </section>
  );
}
