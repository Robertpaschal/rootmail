"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Workflow } from "lucide-react";
import { followUpAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Segment = "clicked" | "opened" | "not_opened" | "all";
const SEGMENTS: { id: Segment; label: string; hint: string }[] = [
  { id: "clicked", label: "clicked a link", hint: "your warmest leads" },
  { id: "opened", label: "opened it", hint: "engaged, not yet converted" },
  { id: "not_opened", label: "didn't open", hint: "try a different angle" },
  { id: "all", label: "everyone", hint: "the whole audience" },
];

/**
 * Campaign → sequence: turn a one-time send into a nurture. Pick who to keep
 * talking to (by how they engaged) and which sequence drips to them next — the
 * end-to-end "campaigns work with sequences" flow, in one place after the send.
 */
export function FollowUp({ campaignId, sequences }: { campaignId: string; sequences: { id: string; name: string }[] }) {
  const [segment, setSegment] = useState<Segment>("clicked");
  const [sequenceId, setSequenceId] = useState("");
  const [result, setResult] = useState<{ enrolled: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sequences.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Workflow className="size-4" /></span>
            <div>
              <p className="text-sm font-medium">Follow up automatically</p>
              <p className="text-xs text-muted-foreground">Build a sequence, then nurture the people who engaged with this campaign.</p>
            </div>
          </div>
          <Link href="/sequences/new" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            Create a sequence <ArrowRight className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const run = () => {
    setError(null);
    setResult(null);
    start(async () => {
      const res = await followUpAction(campaignId, sequenceId, segment);
      if (res.error) return void setError(res.error);
      setResult({ enrolled: res.enrolled ?? 0 });
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Workflow className="size-4 text-primary" />
          <p className="text-sm font-semibold">Follow up with a sequence</p>
        </div>
        {result ? (
          <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Enrolled {result.enrolled.toLocaleString()} {result.enrolled === 1 ? "person" : "people"} — the sequence takes it from here.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              <span>Drip to everyone who</span>
              <Select value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className="h-8 w-auto text-sm">
                {SEGMENTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
              <span>using</span>
              <Select value={sequenceId} onChange={(e) => setSequenceId(e.target.value)} className="h-8 w-auto max-w-52 text-sm">
                <option value="">pick a sequence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Button size="sm" onClick={run} disabled={pending || !sequenceId} className={cn(!sequenceId && "opacity-60")}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Start follow-up
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {SEGMENTS.find((s) => s.id === segment)?.hint}. Already-enrolled people are skipped, and anyone who replies exits the drip automatically.
            </p>
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
