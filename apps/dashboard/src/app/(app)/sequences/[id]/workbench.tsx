"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  DoorOpen,
  Mail,
  MousePointerClick,
  Pencil,
  Split,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import { SequenceBuilder } from "../builder";
import { buildJourney, stopIndexFor, triggerSentence } from "../describe";
import { enrollAction } from "../actions";
import { ActionForm } from "@/components/app/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { countdown } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Enrollment, Sequence, SequenceAnalytics } from "@/lib/types";

/**
 * The sequence as it IS, with editing one click away.
 *
 * This page used to open in the builder — an edit form for something you came
 * to check on. View-first is the house pattern everywhere else (team, client
 * domains, roles, the contact page), and it matters more here than most: a
 * live sequence is mail going out to real people on a timer, so "what is this
 * doing right now" has to be the thing you land on.
 *
 * The page is a HEALTH CHECK first, a performance read second, an editor
 * third — and the hierarchy here says so.
 *
 * Journey and people are ONE component because they are one question. It read
 * as a stack of tidy boxes while "4 emails, here's their open rates" sat on
 * the left and "here are 12 people, on step 3" sat on the right, and joining
 * them was a job for the reader: match an integer against an array that
 * counts waits as steps. Now the people live ON the journey — each stop says
 * how many are parked there waiting for it, and clicking that filters the
 * list to exactly those people. Same data, one object.
 */
export function SequenceWorkbench({
  sequence,
  templates,
  analytics,
  enrollments,
}: {
  sequence: Sequence;
  templates: { slug: string; name: string }[];
  analytics: SequenceAnalytics | null;
  enrollments: Enrollment[];
}) {
  const [editing, setEditing] = useState(false);
  /** Which stop the list is filtered to. `"done"` = the terminus. */
  const [selected, setSelected] = useState<number | "done" | null>(null);

  const stops = useMemo(
    () =>
      buildJourney(
        sequence.steps,
        (slug) => templates.find((t) => t.slug === slug)?.name ?? slug,
      ),
    [sequence.steps, templates],
  );

  /**
   * Park every enrollment somewhere: active people at the stop they're waiting
   * for, everyone else at the terminus. `at` is what both halves read from —
   * the counts on the rail and the rows in the list come from one bucketing,
   * so they can never disagree.
   */
  const parked = useMemo(() => {
    const at = new Map<number | "done", Enrollment[]>();
    for (const e of enrollments) {
      const i =
        e.status === "active" ? stopIndexFor(stops, e.current_step) : -1;
      const key: number | "done" = i === -1 ? "done" : i;
      const list = at.get(key);
      if (list) list.push(e);
      else at.set(key, [e]);
    }
    return at;
  }, [enrollments, stops]);

  const outcomes = useMemo(
    () => ({
      completed: enrollments.filter((e) => e.status === "completed").length,
      exited: enrollments.filter((e) => e.status === "exited").length,
      failed: enrollments.filter((e) => e.status === "failed").length,
    }),
    [enrollments],
  );

  const shown = selected === null ? enrollments : (parked.get(selected) ?? []);
  // Phrased so it reads correctly at ANY count — "1 person no longer in the
  // journey" and "5 people no longer in the journey" both work, where a verb
  // ("who has finished") would have to agree with the number. It also covers
  // all three end states honestly: completed, left early, and failed.
  const selectedLabel =
    selected === null
      ? null
      : selected === "done"
        ? "no longer in the journey"
        : `waiting for “${stops[selected]?.label}”`;

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Editing this sequence</p>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X className="size-4" /> Cancel
          </Button>
        </div>
        <SequenceBuilder sequence={sequence} templates={templates} />
      </div>
    );
  }

  const statFor = (stepIndex: number) => analytics?.steps.find((s) => s.step === stepIndex);
  const toggle = (key: number | "done") => setSelected((cur) => (cur === key ? null : key));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      {/* ---------------------------------------------------------------- */}
      {/* The journey — and everyone standing on it.                        */}
      {/* ---------------------------------------------------------------- */}
      <Card className="lg:col-span-3">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">The journey</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {triggerSentence(sequence.trigger)}, and then:
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          </div>

          {stops.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Mail className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No emails in this sequence yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nobody receives anything until you add at least one.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Add the emails
              </Button>
            </div>
          ) : (
            <ol className="relative space-y-2 border-l pl-6">
              <AnimatePresence initial={false}>
                {stops.map((r, i) => {
                  const st = r.kind === "send" ? statFor(r.stepIndex) : undefined;
                  const here = parked.get(i)?.length ?? 0;
                  const isSelected = selected === i;
                  return (
                    <motion.li
                      key={r.stepIndex}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative"
                    >
                      <span
                        className={cn(
                          "absolute -left-[30px] top-2 grid size-5 place-items-center rounded-full ring-4 ring-card transition-colors",
                          r.kind === "send"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                          isSelected && "bg-primary text-primary-foreground",
                        )}
                      >
                        {r.kind === "send" ? (
                          <Mail className="size-2.5" />
                        ) : (
                          <Split className="size-2.5" />
                        )}
                      </span>

                      <div
                        className={cn(
                          "rounded-lg border bg-muted/20 p-3 transition-colors",
                          isSelected && "border-primary/50 bg-primary/5",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="text-sm font-medium">{r.label}</p>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {r.sub}
                            {r.day > 0 ? ` · day ${r.day}` : ""}
                          </span>
                        </div>

                        {/* Who is standing here, and how this step performed —
                            the two things you'd otherwise read off two halves
                            of the screen and match up yourself. */}
                        {here > 0 || (st && st.sent > 0) ? (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-2 text-xs text-muted-foreground">
                            {here > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggle(i)}
                                aria-pressed={isSelected}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium tabular-nums transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
                                )}
                              >
                                {here} waiting here
                              </button>
                            ) : null}
                            {st && st.sent > 0 ? (
                              <>
                                <span className="tabular-nums">
                                  <span className="font-medium text-foreground">{st.sent}</span> sent
                                </span>
                                <span className="tabular-nums">
                                  <span className="font-medium text-foreground">{st.delivered}</span>{" "}
                                  delivered
                                </span>
                                <span className="flex items-center gap-1 tabular-nums">
                                  <Mail className="size-3" />
                                  <span className="font-medium text-foreground">{st.opened}</span>{" "}
                                  opened
                                </span>
                                <span className="flex items-center gap-1 tabular-nums">
                                  <MousePointerClick className="size-3" />
                                  <span className="font-medium text-foreground">{st.clicked}</span>{" "}
                                  clicked
                                </span>
                              </>
                            ) : null}
                          </div>
                        ) : i === 0 && sequence.status === "paused" ? (
                          <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                            Paused — nobody is being enrolled right now.
                          </p>
                        ) : null}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>

              {/* The rail ends in an OUTCOME rather than trailing off. A
                  journey with nobody through it yet says so plainly instead
                  of printing a row of zeroes. */}
              <li className="relative pt-1">
                <span
                  className={cn(
                    "absolute -left-[30px] top-3 grid size-5 place-items-center rounded-full ring-4 ring-card transition-colors",
                    outcomes.failed > 0
                      ? "bg-destructive/15 text-destructive"
                      : outcomes.completed > 0
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    selected === "done" && "bg-primary text-primary-foreground",
                  )}
                >
                  {outcomes.failed > 0 ? (
                    <TriangleAlert className="size-2.5" />
                  ) : (
                    <CheckCircle2 className="size-2.5" />
                  )}
                </span>
                <div
                  className={cn(
                    "rounded-lg border border-dashed p-3 text-xs transition-colors",
                    selected === "done" && "border-primary/50 border-solid bg-primary/5",
                  )}
                >
                  {outcomes.completed + outcomes.exited + outcomes.failed === 0 ? (
                    <span className="text-muted-foreground">
                      Nobody has reached the end yet.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle("done")}
                      aria-pressed={selected === "done"}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
                    >
                      {outcomes.completed > 0 ? (
                        <span className="tabular-nums text-muted-foreground">
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {outcomes.completed}
                          </span>{" "}
                          finished the whole journey
                        </span>
                      ) : null}
                      {outcomes.exited > 0 ? (
                        <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                          <DoorOpen className="size-3" />
                          <span className="font-medium text-foreground">{outcomes.exited}</span> left
                          early
                        </span>
                      ) : null}
                      {outcomes.failed > 0 ? (
                        <span className="flex items-center gap-1 tabular-nums text-destructive">
                          <span className="font-medium">{outcomes.failed}</span> couldn&apos;t be sent
                        </span>
                      ) : null}
                    </button>
                  )}
                </div>
              </li>
            </ol>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Who's in it — the same people, listed.                            */}
      {/* ---------------------------------------------------------------- */}
      {/* Sticky so the list stays put as you read down a long journey: the
          two halves are meant to be looked at together. */}
      <Card className="lg:sticky lg:top-6 lg:col-span-2">
        <CardContent className="space-y-3 p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                Who&apos;s in it
                {enrollments.length > 0 && selected === null ? ` (${enrollments.length})` : ""}
              </h2>
              {/* The filter is stated in words, not just implied by a
                  highlight halfway up the other column. */}
              {selectedLabel ? (
                <p className="mt-0.5 text-xs text-primary">
                  Showing {shown.length} {shown.length === 1 ? "person" : "people"} {selectedLabel}
                </p>
              ) : null}
            </div>
            {selected !== null ? (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X className="size-3.5" /> Show all
              </Button>
            ) : null}
          </div>

          <ActionForm action={enrollAction} className="flex w-full gap-2">
            <input type="hidden" name="id" value={sequence.id} />
            <Input name="email" type="email" placeholder="Add someone by email" required />
            <Button type="submit" size="icon" aria-label="Enroll">
              <UserPlus className="size-4" />
            </Button>
          </ActionForm>

          {shown.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              {selected === null
                ? "Nobody is enrolled yet. Add someone above, or let the trigger bring them in on its own."
                : "Nobody here right now."}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {shown.map((e) => {
                const i = e.status === "active" ? stopIndexFor(stops, e.current_step) : -1;
                const stop = i === -1 ? null : stops[i];
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.email}</p>
                      {/* This cell used to print `current_step` — an index into
                          an array that counts waits as steps, so "3" could be
                          the second email. Say what they are actually waiting
                          for, and when it lands. */}
                      <p className="truncate text-xs text-muted-foreground">
                        {e.status === "active" ? (
                          stop ? (
                            <>
                              {stop.kind === "send" ? "Next: " : ""}
                              {stop.label} · {countdown(e.next_run_at)}
                            </>
                          ) : stops.length === 0 ? (
                            // Enrolled in a sequence with no emails at all —
                            // "Finishing up" would imply something is under way.
                            "Nothing to send them"
                          ) : (
                            "Finishing up"
                          )
                        ) : e.status === "completed" ? (
                          "Finished the journey"
                        ) : e.status === "exited" ? (
                          "Left early"
                        ) : (
                          "Couldn’t be sent"
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        e.status === "active"
                          ? "secondary"
                          : e.status === "completed"
                            ? "success"
                            : e.status === "failed"
                              ? "destructive"
                              : "muted"
                      }
                    >
                      {e.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
