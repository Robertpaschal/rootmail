"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Mail, MousePointerClick, Pencil, Split, X } from "lucide-react";
import { SequenceBuilder } from "../builder";
import { triggerSentence } from "../describe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Sequence, SequenceAnalytics } from "@/lib/types";

/**
 * The sequence as it IS, with editing one click away.
 *
 * This page used to open in the builder — an edit form for something you came
 * to check on. View-first is the house pattern everywhere else (team, client
 * domains, roles, the contact page), and it matters more here than most: a
 * live sequence is mail going out to real people on a timer, so "what is this
 * doing right now" has to be the thing you land on.
 *
 * Per-step engagement sits ON the step it belongs to. The numbers used to live
 * in a separate table keyed by "#1, #2" that you had to line up against the
 * step list yourself — which is exactly the kind of cross-referencing a person
 * should never be asked to do.
 */
export function SequenceManage({
  sequence,
  templates,
  analytics,
}: {
  sequence: Sequence;
  templates: { slug: string; name: string }[];
  analytics: SequenceAnalytics | null;
}) {
  const [editing, setEditing] = useState(false);

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

  // Walk the steps once, carrying the wait into the send that follows it, so
  // the timeline reads the way the recipient experiences it.
  const rows: {
    kind: "send" | "branch";
    label: string;
    sub: string;
    stepIndex: number;
    day: number;
  }[] = [];
  let pending = 0;
  let elapsed = 0;
  let sendNo = 0;
  sequence.steps.forEach((s, i) => {
    if (s.type === "wait") {
      pending += s.hours;
      return;
    }
    elapsed += pending;
    if (s.type === "send") {
      rows.push({
        kind: "send",
        label: templates.find((t) => t.slug === s.template)?.name ?? s.template,
        sub:
          pending === 0
            ? sendNo === 0
              ? "the moment they enroll"
              : "immediately after"
            : pending % 24 === 0
              ? `${pending / 24} day${pending / 24 === 1 ? "" : "s"} later`
              : `${pending} hour${pending === 1 ? "" : "s"} later`,
        stepIndex: i,
        day: Math.round(elapsed / 24),
      });
      sendNo += 1;
    } else {
      rows.push({
        kind: "branch",
        label: `If they ${s.event} within ${s.within_hours}h`,
        sub: `skip to step ${s.goto}`,
        stepIndex: i,
        day: Math.round(elapsed / 24),
      });
    }
    pending = 0;
  });

  const statFor = (stepIndex: number) => analytics?.steps.find((s) => s.step === stepIndex);

  return (
    <Card>
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

        {rows.length === 0 ? (
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
              {rows.map((r, i) => {
                const st = r.kind === "send" ? statFor(r.stepIndex) : undefined;
                return (
                  <motion.li
                    key={r.stepIndex}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative"
                  >
                    <span
                      className={cn(
                        "absolute -left-[30px] top-2 grid size-5 place-items-center rounded-full ring-4 ring-card",
                        r.kind === "send" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.kind === "send" ? (
                        <Mail className="size-2.5" />
                      ) : (
                        <Split className="size-2.5" />
                      )}
                    </span>

                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-medium">{r.label}</p>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {r.sub}
                          {r.day > 0 ? ` · day ${r.day}` : ""}
                        </span>
                      </div>

                      {/* Engagement on the step it belongs to. Absent until this
                          step has actually sent something — a row of zeroes for
                          an email nobody has reached yet reads as failure. */}
                      {st && st.sent > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            <span className="font-medium text-foreground">{st.sent}</span> sent
                          </span>
                          <span className="tabular-nums">
                            <span className="font-medium text-foreground">{st.delivered}</span> delivered
                          </span>
                          <span className="flex items-center gap-1 tabular-nums">
                            <Mail className="size-3" />
                            <span className="font-medium text-foreground">{st.opened}</span> opened
                          </span>
                          <span className="flex items-center gap-1 tabular-nums">
                            <MousePointerClick className="size-3" />
                            <span className="font-medium text-foreground">{st.clicked}</span> clicked
                          </span>
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
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
