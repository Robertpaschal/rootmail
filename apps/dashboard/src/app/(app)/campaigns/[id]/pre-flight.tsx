"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, PenLine, RotateCcw, Save, Split, Users, X } from "lucide-react";
import { resetRecipientCopy, saveRecipientCopy } from "../actions";
import { ComposeEditor } from "../../messages/new/compose-editor";
import { EmailPreview } from "@/components/app/email-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CampaignPreviewRecipient } from "@/lib/types";
import type { PreviewPerson } from "@/lib/sample-vars";
import { cn } from "@/lib/utils";

/**
 * Pre-flight: read — and if you need to, change — the email each person is
 * about to receive.
 *
 * A campaign is the one send you can't check afterwards; it reaches everyone at
 * once. So before it goes, step through the audience and read their copy. Every
 * line is resolved server-side by the SAME rules the worker applies, so this is
 * the email, not an approximation.
 *
 * And when one person's copy isn't right, fix it here. An edit is stored against
 * that recipient and wins over the template and over any A/B variant — it is, by
 * definition, the version chosen for them.
 */
export function PreFlight({
  campaignId,
  recipients,
  total,
  fromLabel,
}: {
  campaignId: string;
  recipients: CampaignPreviewRecipient[];
  /** How many people the campaign actually reaches (may exceed what we loaded). */
  total: number;
  fromLabel: string;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const current = recipients[i];

  if (recipients.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Users className="size-4 shrink-0" />
          No one is in this audience yet, so there&apos;s nothing to preview.
        </CardContent>
      </Card>
    );
  }

  // EmailPreview's picker speaks PreviewPerson; each copy is already rendered
  // server-side, so no variables are left to substitute here.
  const people: PreviewPerson[] = recipients.map((r) => ({ email: r.email, name: r.name, real: true }));
  const person = people[i];
  const variantCount = new Set(recipients.map((r) => r.variant_tag ?? "")).size;
  const editedCount = recipients.filter((r) => r.edited).length;

  const openEditor = () => {
    setSubject(current.subject);
    setHtml(current.html);
    setError(null);
    setEditing(true);
  };

  const select = (idx: number) => {
    setEditing(false);
    setI(idx);
  };

  const save = () =>
    start(async () => {
      const res = await saveRecipientCopy({ campaignId, email: current.email, subject, html });
      if (res.error) return setError(res.error);
      setEditing(false);
      router.refresh();
    });

  const reset = () =>
    start(async () => {
      const res = await resetRecipientCopy(campaignId, current.email);
      if (res.error) return setError(res.error);
      setEditing(false);
      router.refresh();
    });

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4 text-primary" /> Check it before it goes
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Their actual copy — name, custom fields and A/B variant resolved exactly as the send will. Not
              right for someone? Change just their version.
              {total > recipients.length ? ` Showing ${recipients.length} of ${total.toLocaleString()}.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {editedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
                <PenLine className="size-3" /> {editedCount} edited
              </span>
            ) : null}
            {variantCount > 1 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <Split className="size-3" /> {variantCount} versions in play
              </span>
            ) : null}
          </div>
        </div>

        {/* Who's who — a compact strip you can step through. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {recipients.map((r, idx) => (
            <button
              key={r.email}
              type="button"
              onClick={() => select(idx)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                idx === i ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.edited ? <PenLine className="size-3 text-primary" /> : null}
              {r.name ?? r.email}
              {r.variant_tag ? (
                <span className="rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide">
                  {r.variant_tag}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${current.email}-${editing ? "edit" : "read"}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {current.edited ? (
                  <>
                    <span className="font-medium text-primary">Edited for them</span> — this exact copy is what
                    they receive.
                  </>
                ) : (
                  <>
                    Gets the <span className="font-medium text-foreground">{current.template_name}</span> template
                    {current.variant_tag ? (
                      <>
                        {" "}
                        because they&apos;re tagged{" "}
                        <span className="font-medium text-foreground">“{current.variant_tag}”</span>
                      </>
                    ) : null}
                    .
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                {current.edited && !editing ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={reset}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    Back to the normal copy
                  </button>
                ) : null}
                {!editing ? (
                  <Button type="button" variant="outline" size="sm" onClick={openEditor} className="h-7 text-xs">
                    <PenLine className="size-3.5" /> Edit {current.name?.split(" ")[0] ?? "their"} copy
                  </Button>
                ) : null}
              </div>
            </div>

            {editing ? (
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3 border-b pb-3">
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">Subject</span>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                </div>
                <ComposeEditor
                  initialHtml={current.html}
                  onHtml={setHtml}
                  placeholder="Write this person's version…"
                />
                <p className="text-xs text-muted-foreground">
                  Only {current.name ?? current.email} gets this. Everyone else keeps the campaign&apos;s normal
                  copy. You can still use <span className="font-mono">{"{{variables}}"}</span> — they fill in from
                  their contact record.
                </p>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
                <div className="flex items-center gap-2 border-t pt-3">
                  <Button type="button" size="sm" disabled={busy} onClick={save}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save their copy
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                    <X className="size-4" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <EmailPreview
                html={current.html}
                text={current.text}
                subject={current.subject}
                fromLabel={fromLabel}
                person={person}
                // Already rendered server-side — nothing left to fill in.
                variables={{}}
                people={people}
                onPickPerson={(p) => select(people.findIndex((x) => x.email === p.email))}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
