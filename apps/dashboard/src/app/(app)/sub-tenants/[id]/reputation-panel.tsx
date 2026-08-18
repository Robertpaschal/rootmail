import { AlertTriangle, ChevronDown, Gauge, HelpCircle, PauseCircle, ShieldCheck } from "lucide-react";
import { ResumeClient } from "./resume";
import { LocalTime } from "@/components/app/local-time";
import { ReputationBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import {
  REPUTATION_MIN_VERDICTS,
  REPUTATION_THRESHOLDS,
  REPUTATION_VISUAL,
  TENANT_EVENT_LABEL,
  formatRate,
  readReputation,
} from "@/lib/reputation";
import type { ReputationEvent, ReputationReport, SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * What is happening to this client's mail, and why.
 *
 * The gap this closes: the sweep could throttle or pause a client automatically,
 * and the only place that showed was an error on the next send telling the
 * operator to POST an endpoint by hand. A trap door with no ladder is worse than
 * no trap door — so this panel carries the state, the numbers behind it, when it
 * happened, the history, and the way out.
 *
 * A server component, so the whole thing renders in the first paint of the page;
 * only the resume control (which needs a confirm step) is a client island.
 */

function Tile({
  label,
  value,
  hint,
  crossed,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  crossed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        crossed && "border-red-300 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tabular-nums", crossed && "text-red-600 dark:text-red-400")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

/** The three lines a rate can cross, smallest first — the ladder the sweep walks. */
function Ladder({ warn, throttle, pause }: { warn: number; throttle: number; pause: number }) {
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
      <span className="text-amber-600 dark:text-amber-400">warn {formatRate(warn)}</span> ·{" "}
      <span className="text-amber-600 dark:text-amber-400">throttle {formatRate(throttle)}</span> ·{" "}
      <span className="text-red-600 dark:text-red-400">pause {formatRate(pause)}</span>
    </p>
  );
}

function HistoryRow({ e }: { e: ReputationEvent }) {
  const label = TENANT_EVENT_LABEL[e.event] ?? e.event.replace(/_/g, " ");
  const byHuman = e.actor === "user" || e.actor === "api_key";
  return (
    <li className="border-t px-5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          <LocalTime iso={e.occurred_at} /> · {byHuman ? "by a person" : "automatic"}
        </span>
      </div>
      {e.reason ? <p className="mt-0.5 text-xs text-muted-foreground">{e.reason}</p> : null}
      {typeof e.rate === "number" && typeof e.threshold === "number" ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {e.metric === "complaint" ? "Complaint rate" : "Bounce rate"} {formatRate(e.rate)} against a
          limit of {formatRate(e.threshold)}
          {typeof e.score === "number" ? ` · score ${e.score}/100` : ""}
        </p>
      ) : null}
    </li>
  );
}

export function ReputationPanel({
  st,
  report,
}: {
  st: SubTenant;
  /** Advisory — the page still renders the state from the tenant record if the
   *  history call failed. Thresholds and history are the only things it adds. */
  report: ReputationReport | null;
}) {
  const rep = st.reputation;
  const state = report?.state ?? rep.state;
  const visual = REPUTATION_VISUAL[state] ?? REPUTATION_VISUAL.ok;
  const reading = readReputation(rep);
  const t = report?.thresholds ?? REPUTATION_THRESHOLDS;
  const reason = report?.reason ?? rep.reason;
  const changedAt = report?.changed_at ?? rep.changed_at;
  const checkedAt = report?.checked_at ?? rep.checked_at;
  const resumedAt = report?.resumed_at ?? rep.resumed_at;
  const history = report?.history ?? [];

  const paused = state === "paused";
  // Below the floor we show no score at all. A client six sends into its life is
  // not "94/100" or "0/100" — it is unjudged, and printing a number implies we are
  // already scoring them when enforcement deliberately isn't.
  const showScore = reading.judged && !reading.staleSinceResume && typeof rep.score === "number";

  return (
    <Card
      className={cn(
        paused && "border-red-300 dark:border-red-900/70",
        state === "throttled" && "border-amber-300 dark:border-amber-900/70",
      )}
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Sending reputation
            <ReputationBadge state={state} />
          </CardTitle>
          <CardDescription>
            {state === "ok" && (!reading.judged || reading.staleSinceResume)
              ? "Nothing is restricted. We haven't judged this client's mail yet — see below."
              : visual.effect}
          </CardDescription>
        </div>
        {showScore ? (
          <div className="shrink-0 text-right">
            <p className={cn("text-3xl font-semibold tabular-nums leading-none", visual.text)}>
              {rep.score}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">out of 100</p>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* WHY. A pause with no reason attached is a support ticket nobody can
            answer — least of all the operator's own customer, who is the one
            actually dead in the water. */}
        {reason && state !== "ok" ? (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
              paused
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {paused ? (
              <PauseCircle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {reason}
              {changedAt ? (
                <span className="opacity-80"> — {relativeTime(changedAt)}</span>
              ) : null}
            </span>
          </div>
        ) : null}

        {reading.staleSinceResume ? (
          /* Resumed, not yet re-scored. The stored numbers are the ones that
             caused the pause — showing them here beside "sending normally" was
             the panel contradicting itself in two adjacent sentences. */
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-start gap-2">
              <Gauge className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Not re-scored since the resume</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The last reading — {formatRate(reading.bounceRate)} bounce,{" "}
                  {formatRate(reading.complaintRate)} complaint over {reading.verdicts ?? 0} judged
                  sends — covers the window that caused the restriction, and no longer counts
                  against this client. The next sweep scores them on mail sent after the resume;
                  they run every 15 minutes.
                </p>
              </div>
            </div>
          </div>
        ) : !reading.swept ? (
          /* Never looked at. Not the same as "clean", and saying so costs nothing. */
          <div className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            <HelpCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">No score yet.</span> Every client is
              scored on a sweep that runs every 15 minutes; this one hasn&apos;t had its first
              reading. Nothing is restricted in the meantime.
            </span>
          </div>
        ) : !reading.judged ? (
          /* Swept, but under the floor. This is the state a brand-new client sits
             in for its first afternoon, and it is the one most likely to be
             misread — hence the explicit "we are not scoring you yet". */
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-start gap-2">
              <Gauge className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  No score yet — we start judging after {REPUTATION_MIN_VERDICTS} outcomes
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reading.verdicts ?? 0} of {REPUTATION_MIN_VERDICTS} judged sends in the last{" "}
                  {reading.windowDays} days. A judged send is one the provider actually ruled on —
                  delivered, bounced or complained. Below that floor nothing is warned, throttled or
                  paused, however the early numbers look: one bounce out of three sends is 33% and
                  means nothing.
                </p>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{
                      width: `${Math.min(100, Math.round(((reading.verdicts ?? 0) / REPUTATION_MIN_VERDICTS) * 100))}%`,
                    }}
                  />
                </div>
                {(reading.verdicts ?? 0) > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    So far, not enforced: {formatRate(reading.bounceRate)} bounce ·{" "}
                    {formatRate(reading.complaintRate)} complaint
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          /* Judged. The numbers, and the lines they are measured against. */
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              label="Bounce rate"
              value={formatRate(reading.bounceRate)}
              crossed={reading.metric === "bounce"}
            >
              <Ladder warn={t.warn.bounce} throttle={t.throttle.bounce} pause={t.pause.bounce} />
            </Tile>
            <Tile
              label="Complaint rate"
              value={formatRate(reading.complaintRate)}
              crossed={reading.metric === "complaint"}
            >
              <Ladder
                warn={t.warn.complaint}
                throttle={t.throttle.complaint}
                pause={t.pause.complaint}
              />
            </Tile>
            <Tile
              label="Judged sends"
              value={String(reading.verdicts ?? 0)}
              hint={`Delivered, bounced or complained in the last ${reading.windowDays} days. The sample both rates are measured over.`}
            />
          </div>
        )}

        {/* THE LADDER OUT. Only where it belongs — next to the numbers that
            justify the decision, never as a button on a list row. */}
        {paused ? <ResumeClient id={st.id} name={st.name} domain={st.sending_domain} /> : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5" />
            {checkedAt ? <>Last checked {relativeTime(checkedAt)}</> : <>Not checked yet</>}
          </span>
          {changedAt ? (
            <span>
              State last changed <LocalTime iso={changedAt} />
            </span>
          ) : null}
          {resumedAt ? (
            <span>
              Resumed <LocalTime iso={resumedAt} /> — judged only on mail sent since
            </span>
          ) : null}
        </div>

        {/* View-first: the history is there when you want to explain a decision to
            your own customer, and out of the way when you don't. */}
        {history.length ? (
          <details className="group -mx-5 -mb-5 border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium">
              Reputation history
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                {history.length} change{history.length === 1 ? "" : "s"}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <ul className="border-t">
              {history.map((e, i) => (
                <HistoryRow key={`${e.event}-${e.occurred_at}-${i}`} e={e} />
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
