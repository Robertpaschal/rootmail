"use client";

import { useActionState, useState } from "react";
import { Fact, Line, Metric } from "@rootmail/design";
import { checkDomains } from "./actions";
import {
  reportStations,
  rowLineLabel,
  rowStations,
  unavailableStations,
  utcStamp,
} from "./render";
import {
  MECHANISM_DEFINITION,
  MECHANISM_LABEL,
  type CheckResult,
  type CheckState,
  type CheckedDomain,
  type Mechanism,
  type MechanismResult,
} from "./types";

/**
 * `/check` — the signature toy. Spec: `docs/design/04-EXPERIENCE.md` §6.
 *
 * LAW 1 — motion never makes content visible.
 * There is no animation in this file. Not a reduced one; none. The resting
 * state is server-rendered: the four mechanism rows are present with their
 * definitions and an all-dotted line, because dotted-is-unknown is the correct
 * empty state and it is the rendering law doing the work of an empty-state
 * illustration. The form posts to a SERVER ACTION, so with JavaScript disabled
 * the button still works, the lookup still runs and the result still renders —
 * the page degrades to a full-page POST and loses nothing but the pending
 * label. Kill the script and read it: nothing is missing.
 *
 * LAW 2 — `prefers-reduced-motion` reaches the same information.
 * Trivially satisfied, because there is no animated route to the information in
 * the first place. §6.4 forbids a scanning animation on purpose: a fake progress
 * bar over a 400ms DNS lookup is theatre, and theatre is what this is against.
 * While the action is in flight the button label reads `looking…` and nothing
 * else on the page moves.
 *
 * LAW 3 — the rendering law. Documented in `render.ts`, which owns the whole
 * status → drawing mapping.
 */

const MECHANISMS: Mechanism[] = ["spf", "dkim", "dmarc", "bimi"];

const initial: CheckState = { kind: "idle" };

export function DomainCheck() {
  const [state, formAction, pending] = useActionState(checkDomains, initial);

  const raw = state.kind === "error" ? state.raw : { domain: "", client: "" };
  const done = state.kind === "done" ? state.checked : null;
  // Keep whatever they typed in the box after a submit, with or without script.
  const domainValue =
    done?.[0]?.result.domain ?? (state.kind === "error" ? raw.domain : undefined);
  const clientValue =
    done?.[1]?.result.domain ?? (state.kind === "error" ? raw.client : undefined);

  return (
    <div className="flex flex-col gap-10">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="check-domain" className="text-sm font-medium">
              Your domain
            </label>
            <input
              id="check-domain"
              name="domain"
              type="text"
              required
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              defaultValue={domainValue}
              placeholder="yourbusiness.com"
              className="h-11 w-full rounded-sm border border-rule bg-background px-3 font-mono text-[15px] outline-none ring-ink placeholder:text-muted-foreground focus-visible:ring-2"
            />
          </div>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-sm bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-interaction ease-interaction hover:opacity-90 disabled:opacity-70"
            disabled={pending}
          >
            {pending ? "looking…" : "Check it"}
          </button>
        </div>

        {/* The platform buyer's second field (§6.3). A native <details>, so it
            opens without script and its content is in the DOM either way. */}
        <details className="group">
          <summary className="w-fit cursor-pointer list-none text-sm text-ink-muted underline decoration-rule underline-offset-4 hover:text-foreground">
            Sending for your own customers?
          </summary>
          <div className="mt-3 flex flex-col gap-1.5">
            <label htmlFor="check-client" className="text-sm font-medium">
              One of your customers&rsquo; domains
            </label>
            <input
              id="check-client"
              name="client_domain"
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              defaultValue={clientValue}
              placeholder="theirbusiness.com"
              className="h-11 w-full max-w-sm rounded-sm border border-rule bg-background px-3 font-mono text-[15px] outline-none ring-ink placeholder:text-muted-foreground focus-visible:ring-2"
            />
            <p className="text-sm text-ink-muted">
              We check both and show them side by side. Your reputation and theirs are two
              different things, and this is where that stops being an abstraction.
            </p>
          </div>
        </details>

        <p className="font-mono text-[12.5px] leading-relaxed text-muted-foreground">
          public DNS only · we do not send anything · we do not store your domain
        </p>
      </form>

      {state.kind === "error" ? (
        <p
          role="status"
          className="border-l-2 border-stopped py-1 pl-4 text-sm text-stopped"
        >
          {state.message}
        </p>
      ) : null}

      {done ? (
        <div className="flex flex-col gap-12">
          {done.map((c) => (
            <Result key={c.role} checked={c} paired={done.length > 1} />
          ))}
          {done.length > 1 ? <PairNote /> : null}
        </div>
      ) : (
        <Resting />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ resting */

/**
 * The server-rendered resting state: the shape of the answer, drawn entirely
 * dotted, with every mechanism named and defined. Nothing here is conditional
 * on script, and no fact on this page is revealed by submitting the form that
 * was not already promised by this block.
 */
function Resting() {
  return (
    <section aria-label="Nothing checked yet" className="flex flex-col gap-6">
      <div className="overflow-x-auto pb-1">
        <Line
          scale="page"
          stations={["SPF", "DKIM", "DMARC", "enforced"].map((label) => ({
            label,
            state: "unknown" as const,
          }))}
          label="Nothing checked yet: SPF, DKIM, DMARC and enforcement are all unknown."
        />
      </div>
      <p className="font-mono text-[12.5px] text-muted-foreground">nothing checked yet</p>

      <div className="ruled border-y border-rule">
        {MECHANISMS.map((m) => (
          <div key={m} className="grid grid-cols-[5.5rem_1fr] gap-x-4 py-3.5 sm:grid-cols-[7rem_1fr]">
            <span className="font-mono text-[13px] text-foreground">{MECHANISM_LABEL[m]}</span>
            <span className="text-sm text-ink-muted">{MECHANISM_DEFINITION[m]}</span>
          </div>
        ))}
      </div>

    </section>
  );
}

/* ------------------------------------------------------------------- result */

function Result({ checked, paired }: { checked: CheckedDomain; paired: boolean }) {
  const { result } = checked;
  const heading = paired
    ? checked.role === "yours"
      ? "Your domain"
      : "Your customer’s domain"
    : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {heading ? (
          <span className="text-[12.5px] uppercase tracking-heading text-ink-muted">{heading}</span>
        ) : null}
        <h2 className="display-s">
          <Fact>{result.domain}</Fact>
        </h2>
        {result.fromEmail ? (
          <span className="text-sm text-ink-muted">
            — that was an email address, so we checked the part after the @
          </span>
        ) : null}
      </div>

      {result.ok ? <ReportBody result={result} /> : <UnavailableBody result={result} />}
    </section>
  );
}

function ReportBody({ result }: { result: Extract<CheckResult, { ok: true }> }) {
  const passing = result.items.filter((i) => i.status === "pass").length;

  return (
    <>
      <div className="overflow-x-auto pb-1">
        <Line scale="page" stations={reportStations(result)} />
      </div>

      <div className="ruled border-y border-rule">
        {result.items.map((item) => (
          <Row key={item.mechanism} item={item} />
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <Metric
          size="sm"
          value={`${passing}/${result.items.length}`}
          label="mechanisms passing"
          window="at the moment we looked"
          method="public DNS"
          threshold={result.enforced ? "DMARC enforcing" : "DMARC not enforcing"}
        />
      </div>

      <Sourcing
        queries={result.queries}
        checkedAt={result.checkedAt}
        note="we did not send anything, and we did not store your domain"
      />
    </>
  );
}

/**
 * The three ways we can fail to produce a report, drawn as three different
 * things — because §6.4 says "we did not find it" and "we could not look" are
 * different claims about someone else's infrastructure, and a checker that
 * blurs them is lying about a stranger's DNS.
 */
function UnavailableBody({ result }: { result: Extract<CheckResult, { ok: false }> }) {
  const severed = result.reason === "no_such_domain";
  return (
    <>
      <div className="overflow-x-auto pb-1">
        <Line
          scale="page"
          stations={unavailableStations(result)}
          label={
            severed
              ? "No such domain — nothing to check."
              : "We could not look. Every mechanism is unknown."
          }
        />
      </div>

      <p className={severed ? "text-sm text-stopped" : "text-sm text-ink-muted"}>
        {severed
          ? "The resolver answered, and its answer was that this domain does not exist. There is nothing published here to read."
          : "We could not reach an answer, so we are not going to tell you anything about this domain. Nothing below means “you have no records” — it means we did not see any."}
      </p>

      <div className="ruled border-y border-rule">
        {MECHANISMS.map((m) => (
          <div key={m} className="grid grid-cols-[5.5rem_1fr] gap-x-4 py-3.5 sm:grid-cols-[7rem_1fr]">
            <span className="font-mono text-[13px]">{MECHANISM_LABEL[m]}</span>
            <span className="text-sm text-ink-muted">
              not checked — {severed ? "there is no such domain" : "we could not look"}
            </span>
          </div>
        ))}
      </div>

      <Sourcing
        queries={0}
        checkedAt={result.checkedAt}
        lead={result.detail}
        note="we did not send anything, and we did not store your domain"
      />
    </>
  );
}

function Row({ item }: { item: MechanismResult }) {
  return (
    <div className="grid grid-cols-1 gap-y-2 py-4 sm:grid-cols-[7rem_1fr] sm:gap-x-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[13px]">{MECHANISM_LABEL[item.mechanism]}</span>
        <Line stations={rowStations(item)} label={rowLineLabel(item)} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed">
          <StatusWord item={item} /> {item.detail}
        </p>

        {item.found.length > 0 ? (
          <div className="overflow-x-auto rounded-sm bg-muted/60 px-3 py-2">
            {item.found.map((value, i) => (
              <pre
                key={i}
                className="whitespace-pre-wrap break-all font-mono text-[12.5px] leading-relaxed text-foreground"
                data-fact
              >
                {value}
              </pre>
            ))}
          </div>
        ) : null}

        <p className="font-mono text-[12.5px] leading-relaxed text-muted-foreground">
          {item.queried.length === 1
            ? `looked at ${item.queried[0]}`
            : `looked at ${item.queried.length} names, starting ${item.queried[0]}`}
        </p>

        {item.caveat ? (
          <p className="border-l-2 border-rule pl-3 text-[13px] leading-relaxed text-ink-muted">
            {item.caveat}
          </p>
        ) : null}

        {item.suggestion ? <Suggestion host={item.suggestion.host} value={item.suggestion.value} /> : null}
      </div>
    </div>
  );
}

function StatusWord({ item }: { item: MechanismResult }) {
  const [word, tone] =
    item.status === "pass"
      ? ["pass", "text-witnessed"]
      : item.status === "weak"
        ? ["weak", "text-acted"]
        : item.status === "missing"
          ? ["not found", "text-muted-foreground"]
          : item.lookup === "failed"
            ? ["could not look", "text-stopped"]
            : ["stopped", "text-stopped"];
  return <span className={`font-mono text-[12px] uppercase tracking-heading ${tone}`}>{word}</span>;
}

/**
 * The record to publish, verbatim, with a copy button. Not a signup prompt —
 * they came for an answer, so they get the answer. The text is selectable
 * whether or not the button works, so a browser with no clipboard API (or no
 * script at all) loses a convenience, never the content.
 */
function Suggestion({ host, value }: { host: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-rule p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] uppercase tracking-heading text-ink-muted">
          publish this TXT record
        </span>
        <button
          type="button"
          className="shrink-0 font-mono text-[12.5px] text-ink-muted underline decoration-rule underline-offset-4 transition-colors duration-interaction ease-interaction hover:text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-all font-mono text-[12.5px] leading-relaxed" data-fact>
        <span className="text-muted-foreground">{host}</span>
        {"\n"}
        {value}
      </pre>
    </div>
  );
}

function Sourcing({
  queries,
  checkedAt,
  lead,
  note,
}: {
  queries: number;
  checkedAt: string;
  lead?: string;
  note: string;
}) {
  return (
    <p className="font-mono text-[12.5px] leading-relaxed text-muted-foreground">
      {lead ? (
        <>
          {lead}
          <br />
        </>
      ) : (
        <>
          looked up {queries} names · public DNS · {utcStamp(checkedAt)}
          <br />
        </>
      )}
      {note}
    </p>
  );
}

function PairNote() {
  return (
    <p className="max-w-prose border-l-2 border-rule pl-4 text-sm leading-relaxed text-ink-muted">
      Two domains, two answers, and nothing about the first one makes the second one true.
      That is the whole reason a platform sending for its customers needs a score per
      customer rather than a score.
    </p>
  );
}
