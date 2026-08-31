"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import { type SeqFormState, saveSequence } from "./actions";
import { type EmailDraft, dayOf, delayLabel, toEmails, toSteps } from "./describe";
import { StageRail, StageScene } from "@/components/app/stage-rail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Sequence, SequenceStepDef } from "@/lib/types";

/**
 * Build a sequence as a journey, not a form.
 *
 * The old builder put everything on one screen — name, status, trigger, and a
 * flat list of rows where each row began with a dropdown reading
 * "wait / send / branch". That asks a first-time user to hold the whole data
 * model in their head before they can express the thing they actually want,
 * which is nearly always "email these people three times over a week".
 *
 * TWO CHANGES CARRY MOST OF IT.
 *
 * 1 · A DELAY IS NOT A STEP. People think "send this, then two days later send
 *     that" — not "wait step, send step, wait step, send step". So an email
 *     OWNS the gap before it, and we expand that back into the wait/send pairs
 *     the engine wants on the way out (`toSteps`). Same stored shape, half the
 *     concepts on screen.
 *
 * 2 · BRANCHES ARE NOT THE COMMON CASE. "if opened within 48h go to step 3" is
 *     index arithmetic against a list whose indices move when you edit it — the
 *     single most confusing thing here, and rare. It lives behind Advanced. A
 *     sequence that already HAS one opens in Advanced automatically, so nothing
 *     becomes uneditable.
 *
 * The rail is the same one templates, the composer and campaigns use.
 */

/** The engine's shape, unchanged — this file only changes how it is authored.
 *  The emails⇄steps conversion lives in `describe.ts` so it can be tested and
 *  reused without dragging this client component along. */
type StepDraft = SequenceStepDef;

const STAGES = [
  { id: "start", label: "Who joins", hint: "Pick what puts someone into this sequence." },
  { id: "emails", label: "The emails", hint: "What you send, and how long between each." },
  { id: "review", label: "Review", hint: "What one person will actually experience." },
];

/** Common shapes, so a blank page is never the starting point. */
const PRESETS: { id: string; name: string; blurb: string; icon: typeof Mail; gaps: number[] }[] = [
  { id: "welcome", name: "Welcome series", blurb: "Say hello, then two useful follow-ups", icon: Sparkles, gaps: [0, 48, 120] },
  { id: "onboard", name: "Onboarding", blurb: "Five emails across the first fortnight", icon: UserPlus, gaps: [0, 24, 72, 168, 336] },
  { id: "winback", name: "Win-back", blurb: "Two nudges for someone gone quiet", icon: Zap, gaps: [0, 96] },
];

export function SequenceBuilder({
  sequence,
  templates,
}: {
  sequence?: Sequence;
  templates: { slug: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<SeqFormState | null, FormData>(saveSequence, null);

  const initialSteps = (sequence?.steps as StepDraft[]) ?? [];
  const initialEmails = useMemo(() => toEmails(initialSteps), [sequence]); // eslint-disable-line react-hooks/exhaustive-deps

  const [advanced, setAdvanced] = useState(initialEmails === null && initialSteps.length > 0);
  const [emails, setEmails] = useState<EmailDraft[]>(initialEmails ?? []);
  const [rawSteps, setRawSteps] = useState<StepDraft[]>(initialSteps);
  const [name, setName] = useState(sequence?.name ?? "");
  const [triggerType, setTriggerType] = useState(sequence?.trigger.type ?? "contact_tagged");
  const [triggerTag, setTriggerTag] = useState(sequence?.trigger.tag ?? "");
  const [live, setLive] = useState((sequence?.status ?? "active") === "active");

  const [stage, setStage] = useState(0);
  const [furthest, setFurthest] = useState(sequence ? STAGES.length - 1 : 0);
  const [dir, setDir] = useState(1);

  const steps = advanced ? rawSteps : toSteps(emails);
  const emailCount = advanced ? rawSteps.filter((s) => s.type === "send").length : emails.length;

  const go = (to: number) => {
    setDir(to > stage ? 1 : -1);
    setStage(to);
    setFurthest((f) => Math.max(f, to));
  };

  const startReady = name.trim().length > 0 && (triggerType !== "contact_tagged" || triggerTag.trim().length > 0);
  const emailsReady = emailCount > 0 && steps.every((s) => s.type !== "send" || s.template);

  const addEmail = () =>
    setEmails((e) => [...e, { template: templates[0]?.slug ?? "", afterHours: e.length === 0 ? 0 : 48 }]);
  const patchEmail = (i: number, p: Partial<EmailDraft>) =>
    setEmails((e) => e.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const dropEmail = (i: number) => setEmails((e) => e.filter((_, j) => j !== i));

  const applyPreset = (gaps: number[]) =>
    setEmails(gaps.map((h) => ({ template: templates[0]?.slug ?? "", afterHours: h })));

  return (
    <form action={action}>
      {sequence ? <input type="hidden" name="id" value={sequence.id} /> : null}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="status" value={live ? "active" : "paused"} />
      <input type="hidden" name="trigger_type" value={triggerType} />
      <input type="hidden" name="trigger_tag" value={triggerTag} />
      <input type="hidden" name="steps" value={JSON.stringify(steps satisfies SequenceStepDef[])} />

      <StageRail stages={STAGES} current={stage} furthest={furthest} onJump={go} />

      <AnimatePresence mode="wait" initial={false}>
        {/* ── 1 · WHO JOINS ─────────────────────────────────────────────── */}
        {stage === 0 ? (
          <StageScene keyId="start" direction={dir}>
            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-2">
                  <Label htmlFor="seq-name">What is this sequence for?</Label>
                  <Input
                    id="seq-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Welcome new signups"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Only you see this — it names the sequence in your list.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>What puts someone in it?</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        { id: "contact_tagged", icon: Tag, title: "They get a tag", blurb: "The usual choice — tag someone and the sequence starts." },
                        { id: "contact_created", icon: UserPlus, title: "They're added", blurb: "Everyone new, the moment they land in your audience." },
                        { id: "manual", icon: Zap, title: "Only when you say", blurb: "You enroll them by hand, or your code does." },
                      ] as const
                    ).map((o) => {
                      const on = triggerType === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setTriggerType(o.id)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition-colors",
                            on ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40",
                          )}
                        >
                          <o.icon className={cn("size-4", on ? "text-primary" : "text-muted-foreground")} />
                          <p className="mt-1.5 text-sm font-medium">{o.title}</p>
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{o.blurb}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {triggerType === "contact_tagged" ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid gap-2 pt-1">
                        <Label htmlFor="seq-tag">Which tag?</Label>
                        <Input
                          id="seq-tag"
                          value={triggerTag}
                          onChange={(e) => setTriggerTag(e.target.value)}
                          placeholder="new-signup"
                          className="sm:max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          Anyone who gets this tag — by hand, by import, or from a signup form — starts
                          the sequence.
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="flex justify-end border-t pt-4">
                  <Button type="button" disabled={!startReady} onClick={() => go(1)}>
                    Next: the emails <ArrowRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </StageScene>
        ) : null}

        {/* ── 2 · THE EMAILS ────────────────────────────────────────────── */}
        {stage === 1 ? (
          <StageScene keyId="emails" direction={dir}>
            <Card>
              <CardContent className="space-y-4 p-6">
                {templates.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <Mail className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">You need a template first</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                      A sequence sends templates, so there has to be at least one to send. Design it
                      once and reuse it here.
                    </p>
                    <Link
                      href="/templates"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                      <Plus className="size-3.5" /> Design a template
                    </Link>
                  </div>
                ) : !advanced ? (
                  <>
                    {emails.length === 0 ? (
                      /* A blank page is the worst starting point for something
                         most people have never built before. */
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Start from a common shape, or add emails one at a time.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {PRESETS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyPreset(p.gaps)}
                              className="rounded-lg border p-3 text-left transition-colors hover:border-primary/50"
                            >
                              <p.icon className="size-4 text-primary" />
                              <p className="mt-1.5 text-sm font-medium">{p.name}</p>
                              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{p.blurb}</p>
                              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                                {p.gaps.length} emails
                              </p>
                            </button>
                          ))}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addEmail}>
                          <Plus className="size-3.5" /> Start with one email
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                          {emails.map((e, i) => (
                            <motion.div
                              key={i}
                              layout
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              className="rounded-lg border bg-muted/20 p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-rule text-[12.5px] font-semibold text-ink-muted">
                                  {i + 1}
                                </span>

                                {/* The gap belongs to the email, in the words a
                                    person would use for it. */}
                                {i === 0 ? (
                                  <span className="text-sm text-muted-foreground">
                                    sent <span className="font-medium text-foreground">straight away</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Clock className="size-3.5" />
                                    <Input
                                      type="number"
                                      min={1}
                                      value={Math.max(1, Math.round(e.afterHours / 24)) || 1}
                                      onChange={(ev) =>
                                        patchEmail(i, { afterHours: Math.max(1, Number(ev.target.value)) * 24 })
                                      }
                                      className="h-8 w-16"
                                      aria-label={`Days before email ${i + 1}`}
                                    />
                                    days later
                                  </span>
                                )}

                                <Select
                                  value={e.template}
                                  onChange={(ev) => patchEmail(i, { template: ev.target.value })}
                                  className="h-8 min-w-44 flex-1"
                                  aria-label={`Template for email ${i + 1}`}
                                >
                                  <option value="">Pick a template…</option>
                                  {templates.map((t) => (
                                    <option key={t.slug} value={t.slug}>
                                      {t.name}
                                    </option>
                                  ))}
                                </Select>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground hover:text-destructive"
                                  aria-label={`Remove email ${i + 1}`}
                                  onClick={() => dropEmail(i)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        <Button type="button" variant="outline" size="sm" onClick={addEmail}>
                          <Plus className="size-3.5" /> Add another email
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <AdvancedSteps steps={rawSteps} setSteps={setRawSteps} templates={templates} />
                )}

                {templates.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        // Switching INTO advanced carries the emails over, so
                        // nothing you already laid out is lost.
                        if (!advanced) setRawSteps(toSteps(emails));
                        else {
                          const back = toEmails(rawSteps);
                          if (back) setEmails(back);
                        }
                        setAdvanced((v) => !v);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Settings2 className="size-3.5" />
                      {advanced ? "Back to the simple view" : "Advanced — branches and exact hours"}
                    </button>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" onClick={() => go(0)}>
                        <ArrowLeft className="size-4" /> Back
                      </Button>
                      <Button type="button" disabled={!emailsReady} onClick={() => go(2)}>
                        Review <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </StageScene>
        ) : null}

        {/* ── 3 · REVIEW ────────────────────────────────────────────────── */}
        {stage === 2 ? (
          <StageScene keyId="review" direction={dir}>
            <Card>
              <CardContent className="space-y-5 p-6">
                <div>
                  <h2 className="text-sm font-semibold">What one person will experience</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {triggerType === "contact_tagged"
                      ? `Someone gets the “${triggerTag}” tag, and then:`
                      : triggerType === "contact_created"
                        ? "Someone is added to your audience, and then:"
                        : "You enroll someone, and then:"}
                  </p>
                </div>

                <ol className="relative space-y-3 border-l pl-5">
                  {advanced
                    ? rawSteps.map((s, i) => (
                        <li key={i} className="relative text-sm">
                          <span className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-primary ring-4 ring-card" />
                          {s.type === "wait" ? (
                            <span className="text-muted-foreground">Wait {s.hours} hours</span>
                          ) : s.type === "send" ? (
                            <span>
                              Send <span className="font-medium">{templates.find((t) => t.slug === s.template)?.name ?? s.template}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              If {s.event} within {s.within_hours}h → jump to step {s.goto}
                            </span>
                          )}
                        </li>
                      ))
                    : emails.map((e, i) => (
                        <li key={i} className="relative">
                          <span className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-primary ring-4 ring-card" />
                          <p className="text-sm">
                            <span className="font-medium">
                              {templates.find((t) => t.slug === e.template)?.name ?? "No template picked"}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {delayLabel(e.afterHours)}
                            {i > 0 ? ` · day ${dayOf(emails, i)}` : ""}
                          </p>
                        </li>
                      ))}
                </ol>

                {/* The guarantee that makes a sequence safe to turn on. */}
                <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    It stops the moment they reply — nobody gets robot-messaged while they are already
                    talking to you. Emails go from your verified address and replies come back to your
                    inbox.
                  </p>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    checked={live}
                    onChange={(e) => setLive(e.target.checked)}
                    className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className="block text-sm font-medium">Turn it on now</span>
                    <span className="block text-xs text-muted-foreground">
                      {live
                        ? "New people matching the trigger start receiving it as soon as you save."
                        : "Saved as paused — nobody is enrolled until you turn it on."}
                    </span>
                  </span>
                </label>

                {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

                <div className="flex items-center justify-between border-t pt-4">
                  <Button type="button" variant="ghost" onClick={() => go(1)}>
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                  <div className="flex items-center gap-3">
                    {state?.saved ? (
                      <span className="flex items-center gap-1.5 text-sm text-witnessed">
                        <Check className="size-4" /> Saved
                      </span>
                    ) : null}
                    <Button type="submit" disabled={pending || !emailsReady}>
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {sequence ? "Save changes" : live ? "Create and turn on" : "Create as paused"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StageScene>
        ) : null}
      </AnimatePresence>
    </form>
  );
}

/**
 * The original row editor, kept whole behind Advanced.
 *
 * Branch steps address other steps by INDEX, which is why they are not in the
 * main path: the indices shift under you as you edit. Anyone who needs them
 * still gets them, and an existing sequence containing one opens here.
 */
function AdvancedSteps({
  steps,
  setSteps,
  templates,
}: {
  steps: StepDraft[];
  setSteps: React.Dispatch<React.SetStateAction<StepDraft[]>>;
  templates: { slug: string; name: string }[];
}) {
  const DEFAULTS: Record<StepDraft["type"], StepDraft> = {
    wait: { type: "wait", hours: 24 },
    send: { type: "send", template: templates[0]?.slug ?? "" },
    branch: { type: "branch", event: "opened", within_hours: 48, goto: 0 },
  };
  const update = (i: number, patch: Partial<StepDraft>) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? ({ ...step, ...patch } as StepDraft) : step)));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Steps run in order. A branch jumps to another step by its number on the left.
      </p>
      {steps.map((step, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
          <span className="w-5 text-xs tabular-nums text-muted-foreground">{i}</span>
          <Select
            value={step.type}
            onChange={(e) => update(i, DEFAULTS[e.target.value as StepDraft["type"]])}
            className="h-8 w-28"
            aria-label={`Step ${i} type`}
          >
            <option value="wait">Wait</option>
            <option value="send">Send</option>
            <option value="branch">Branch</option>
          </Select>

          {step.type === "wait" ? (
            <span className="flex items-center gap-1.5 text-sm">
              <Input type="number" min={0} value={step.hours} onChange={(e) => update(i, { hours: Number(e.target.value) })} className="h-8 w-20" aria-label="Hours" />
              hours
            </span>
          ) : null}

          {step.type === "send" ? (
            <Select value={step.template} onChange={(e) => update(i, { template: e.target.value })} className="h-8 min-w-40 flex-1" aria-label="Template">
              <option value="">Pick a template…</option>
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </Select>
          ) : null}

          {step.type === "branch" ? (
            <span className="flex flex-wrap items-center gap-1.5 text-sm">
              if
              <Select value={step.event} onChange={(e) => update(i, { event: e.target.value as "opened" | "clicked" })} className="h-8 w-28" aria-label="Event">
                <option value="opened">opened</option>
                <option value="clicked">clicked</option>
              </Select>
              within
              <Input type="number" min={1} value={step.within_hours} onChange={(e) => update(i, { within_hours: Number(e.target.value) })} className="h-8 w-20" aria-label="Within hours" />
              h → go to step
              <Input type="number" min={0} value={step.goto} onChange={(e) => update(i, { goto: Number(e.target.value) })} className="h-8 w-16" aria-label="Go to step" />
            </span>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove step"
            className="ml-auto size-7 text-muted-foreground hover:text-destructive"
            onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        {(["wait", "send", "branch"] as const).map((t) => (
          <Button key={t} type="button" variant="outline" size="sm" onClick={() => setSteps((s) => [...s, DEFAULTS[t]])}>
            <Plus className="size-3.5" /> {t}
          </Button>
        ))}
      </div>
    </div>
  );
}
