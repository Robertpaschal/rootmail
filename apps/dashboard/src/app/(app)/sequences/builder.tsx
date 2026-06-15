"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { type SeqFormState, saveSequence } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Sequence, SequenceStepDef } from "@/lib/types";

type StepDraft =
  | { type: "wait"; hours: number }
  | { type: "send"; template: string }
  | { type: "branch"; event: "opened" | "clicked"; within_hours: number; goto: number };

const DEFAULTS: Record<StepDraft["type"], StepDraft> = {
  wait: { type: "wait", hours: 24 },
  send: { type: "send", template: "" },
  branch: { type: "branch", event: "opened", within_hours: 48, goto: 0 },
};

export function SequenceBuilder({
  sequence,
  templates,
}: {
  sequence?: Sequence;
  templates: { slug: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<SeqFormState | null, FormData>(saveSequence, null);
  const [steps, setSteps] = useState<StepDraft[]>((sequence?.steps as StepDraft[]) ?? []);
  const [triggerType, setTriggerType] = useState(sequence?.trigger.type ?? "manual");

  const update = (i: number, patch: Partial<StepDraft>) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? ({ ...step, ...patch } as StepDraft) : step)));
  const add = (type: StepDraft["type"]) => setSteps((s) => [...s, DEFAULTS[type]]);
  const remove = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  return (
    <Card>
      <CardContent className="p-6">
        <form action={action} className="space-y-5">
          {sequence ? <input type="hidden" name="id" value={sequence.id} /> : null}
          <input type="hidden" name="steps" value={JSON.stringify(steps satisfies SequenceStepDef[])} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={sequence?.name} placeholder="Onboarding" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={sequence?.status ?? "active"}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="trigger_type">Enrollment trigger</Label>
              <Select
                id="trigger_type"
                name="trigger_type"
                defaultValue={sequence?.trigger.type ?? "manual"}
                onChange={(e) => setTriggerType(e.target.value as typeof triggerType)}
              >
                <option value="manual">Manual / API</option>
                <option value="contact_created">When a contact is created</option>
                <option value="contact_tagged">When a contact is tagged</option>
              </Select>
            </div>
            {triggerType === "contact_tagged" ? (
              <div className="grid gap-2">
                <Label htmlFor="trigger_tag">Tag</Label>
                <Input id="trigger_tag" name="trigger_tag" defaultValue={sequence?.trigger.tag} placeholder="new" />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Steps</Label>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No steps yet — add one below.</p>
            ) : null}
            {steps.map((step, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
                <span className="w-5 text-xs text-muted-foreground tabular-nums">{i}</span>
                <Select
                  value={step.type}
                  onChange={(e) => update(i, DEFAULTS[e.target.value as StepDraft["type"]])}
                  className="w-28"
                >
                  <option value="wait">Wait</option>
                  <option value="send">Send</option>
                  <option value="branch">Branch</option>
                </Select>

                {step.type === "wait" ? (
                  <span className="flex items-center gap-1.5 text-sm">
                    <Input
                      type="number"
                      min={0}
                      value={step.hours}
                      onChange={(e) => update(i, { hours: Number(e.target.value) })}
                      className="w-20"
                    />
                    hours
                  </span>
                ) : null}

                {step.type === "send" ? (
                  <Select value={step.template} onChange={(e) => update(i, { template: e.target.value })} className="flex-1 min-w-40">
                    <option value="">Pick a template…</option>
                    {templates.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </Select>
                ) : null}

                {step.type === "branch" ? (
                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                    if
                    <Select value={step.event} onChange={(e) => update(i, { event: e.target.value as "opened" | "clicked" })} className="w-28">
                      <option value="opened">opened</option>
                      <option value="clicked">clicked</option>
                    </Select>
                    within
                    <Input type="number" min={1} value={step.within_hours} onChange={(e) => update(i, { within_hours: Number(e.target.value) })} className="w-20" />
                    h → go to step
                    <Input type="number" min={0} value={step.goto} onChange={(e) => update(i, { goto: Number(e.target.value) })} className="w-16" />
                  </span>
                ) : null}

                <Button type="button" variant="ghost" size="icon" className="ml-auto size-7 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              {(["wait", "send", "branch"] as const).map((t) => (
                <Button key={t} type="button" variant="outline" size="sm" onClick={() => add(t)}>
                  <Plus className="size-3.5" /> {t}
                </Button>
              ))}
            </div>
          </div>

          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {sequence ? "Save changes" : "Create sequence"}
            </Button>
            {state?.saved ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <Check className="size-4" /> Saved
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
