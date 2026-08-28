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
 */

type Tone = "ok" | "acted" | "stopped";

const TONE = {
  ok: { text: "text-witnessed", bar: "bg-witnessed" },
  acted: { text: "text-acted", bar: "bg-acted" },
  stopped: { text: "text-stopped", bar: "bg-stopped" },
} as const;

/** The five states the sweep moves a tenant through, in order. */
const STEPS: Array<{ bounces: string; status: string; tone: Tone }> = [
  { bounces: "0.4%", status: "sending", tone: "ok" },
  { bounces: "3.1%", status: "sending", tone: "ok" },
  { bounces: "6.0%", status: "warned 03:58", tone: "acted" },
  { bounces: "8.4%", status: "throttled 60/hour", tone: "acted" },
  { bounces: "11.2%", status: "paused 04:12", tone: "stopped" },
];

/** The two clients that are not being simulated. Their counts keep moving. */
const OTHERS = [
  { domain: "harbourclinic.com", status: "throttled 60/hour", tone: "acted" as Tone, sent: 2318, per: 11 },
  { domain: "northlakegym.com", status: "paused 04:12", tone: "stopped" as Tone, sent: 940, per: 0 },
];

function Branch({
  domain,
  status,
  tone,
  detail,
  weight,
}: {
  domain: string;
  status: string;
  tone: Tone;
  detail: string;
  /** `2` normal, `1` throttled and therefore literally thinner, `0` severed. */
  weight: 0 | 1 | 2;
}) {
  const t = TONE[tone];
  return (
    <div className="relative flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4 pl-6">
      <span
        aria-hidden="true"
        className={`absolute left-[-20px] top-[1.15rem] sm:left-[-32px] ${t.bar} ${
          weight === 1 ? "h-px" : "h-[2px]"
        } ${weight === 0 ? "w-4 sm:w-7" : "w-6 sm:w-9"}`}
      />
      <span
        aria-hidden="true"
        className={`absolute top-[0.95rem] ${t.bar} ${
          weight === 0 ? "left-1 h-4 w-[3px] rounded-sm" : "left-1 size-2 rounded-full"
        }`}
      />
      <span className="font-mono text-[13px] font-medium" data-fact>
        {domain}
      </span>
      <span className={`text-[13px] font-medium ${t.text}`}>{status}</span>
      <span className="w-full font-mono text-[11px] text-ink-muted sm:ml-auto sm:w-auto" data-fact>
        {detail}
      </span>
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
    <section id="clients" className="slab settle bg-muted/40">
      <div className="container py-14 md:py-24">
        <div className="max-w-3xl">
          <h2 className="display-l text-balance">
            When you send for other people, you inherit their behaviour.
          </h2>
          <p className="lead mt-5 text-ink-muted">
            Each client has their own domain and their own score. rootmail warns, throttles, then
            stops the one going wrong — while you sleep.
          </p>
        </div>

        <figure className="mt-10 rounded-lg border border-rule bg-card shadow-e1 p-5 sm:p-7">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <span className="display-s">One trunk, one branch per client</span>
            <span className="font-mono text-[11px] text-ink-muted" data-fact>
              illustrative · sample domains · compressed from 7 days
            </span>
          </figcaption>

          <div className="relative mt-7 pl-5 sm:pl-8">
            {/* The trunk. It is shared, it is 2px, and it never changes colour —
                because it survived, which is the only reason the other two
                branches below are still counting. */}
            <span
              className="absolute bottom-6 left-0 top-2 w-[2px] bg-foreground"
              aria-hidden="true"
            />
            <p className="-mt-1 mb-5 font-mono text-[11px] leading-relaxed text-ink-muted">
              the trunk is shared: one provider account, one IP pool, one warm-up history
            </p>

            <div className="ruled border-t border-rule">
              <Branch
                domain="sunsetvillas.com"
                status={cur.status}
                tone={cur.tone}
                detail={`bounces ${cur.bounces} · 7d`}
                weight={weight}
              />
              {OTHERS.map((o) => (
                <Branch
                  key={o.domain}
                  domain={o.domain}
                  status={o.status}
                  tone={o.tone}
                  detail={`${(o.sent + o.per * step).toLocaleString()} sent · 7d`}
                  weight={o.tone === "stopped" ? 0 : 1}
                />
              ))}
            </div>

            {/* The disclosure, on the trunk, as a consequence of the click. */}
            {step === STEPS.length - 1 ? (
              <p className="mt-5 font-mono text-[11px] text-ink-muted" data-fact>
                the trunk carried 1,180 of this client&apos;s bounces before we stopped it
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule pt-4">
            <button
              type="button"
              onClick={dirty ? reset : run}
              className="inline-flex min-h-11 items-center text-[13px] font-medium underline underline-offset-4"
            >
              {dirty ? "Put it back" : "Simulate a dirty list"}
            </button>
            <span className="font-mono text-[11px] text-ink-muted" aria-live="polite" data-fact>
              {running ? "running" : `step ${step}`}
            </span>
          </div>

          {/* The five steps, always present. This is the reduced-motion route
              and the no-script route, and it is the same five figures the
              simulation walks. */}
          <ol className="ruled mt-4 border-t border-rule font-mono text-[11px]">
            {STEPS.map((s, i) => (
              <li
                key={s.bounces}
                className={`flex gap-x-6 py-2 ${i === step ? "text-foreground" : "text-ink-muted"}`}
                data-fact
              >
                <span className="w-10 shrink-0">{s.bounces}</span>
                <span className={i === step ? TONE[s.tone].text : undefined}>{s.status}</span>
              </li>
            ))}
          </ol>
        </figure>

        <div className="mt-10">
          <p className="max-w-lg text-[0.9375rem] leading-relaxed text-ink-muted">
            Connect your own SES or Mailgun; the mail keeps leaving on your account, and
            disconnecting puts it all back.
          </p>
          <ul className="ruled mt-5 border-t border-rule font-mono text-[11px] text-ink-muted">
            {[
              "your provider · SES, Mailgun, or ours",
              "your IP reputation and warm-up",
              "your domains and DNS",
              "your deliverability contacts",
            ].map((k) => (
              <li key={k} className="py-2.5" data-fact>
                {k}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-ink-muted">
            <a
              href="https://developers.rootmail.io/docs"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
            >
              The five DNS steps are in the docs
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
