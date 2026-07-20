"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  Send,
  Split,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { type CampaignFormState, createCampaign, listTagsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CampaignVariant, ListTag } from "@/lib/types";

export interface ComposerList {
  id: string;
  name: string;
  contacts: number;
}
export interface ComposerTemplate {
  id: string;
  name: string;
  subject: string;
  type: string;
}

/** Section shell: a numbered step with a title + hint, revealed with a rise. */
function Step({
  n,
  title,
  hint,
  children,
  delay = 0,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut", delay }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <span className="hidden text-xs text-muted-foreground sm:inline">— {hint}</span> : null}
      </div>
      {children}
    </motion.section>
  );
}

export function CampaignComposer({
  lists,
  templates,
  sendsFrom,
}: {
  lists: ComposerList[];
  templates: ComposerTemplate[];
  sendsFrom?: string | null;
}) {
  const [state, action, pending] = useActionState<CampaignFormState | null, FormData>(createCampaign, null);

  const [listId, setListId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [segmentTag, setSegmentTag] = useState("");
  const [variants, setVariants] = useState<CampaignVariant[]>([]);
  const [tags, setTags] = useState<ListTag[] | null>(null);

  const list = lists.find((l) => l.id === listId);

  // Tags follow the audience choice; segment + variants reset with it.
  useEffect(() => {
    setSegmentTag("");
    setVariants([]);
    setTags(null);
    if (!listId) return;
    void listTagsAction(listId).then((res) => setTags(res.tags ?? []));
  }, [listId]);

  // Recipients preview: the segment narrows the count to the tag's carriers.
  const reach = useMemo(() => {
    if (!list) return null;
    if (!segmentTag) return list.contacts;
    return tags?.find((t) => t.tag === segmentTag)?.contacts ?? null;
  }, [list, segmentTag, tags]);

  const addVariant = () => {
    const usedTags = new Set(variants.map((v) => v.tag));
    const nextTag = (tags ?? []).find((t) => !usedTags.has(t.tag))?.tag ?? "";
    const nextTpl = templates.find((t) => t.id !== templateId)?.id ?? templates[0]?.id ?? "";
    setVariants((v) => [...v, { tag: nextTag, template_id: nextTpl, subject: "" }]);
  };
  const patchVariant = (i: number, patch: Partial<CampaignVariant>) =>
    setVariants((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, j) => j !== i));

  const ready = listId && templateId;

  return (
    <form action={action} className="max-w-3xl space-y-8">
      {/* Everything the guided UI chose travels as plain form fields. */}
      <input type="hidden" name="list_id" value={listId} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="segment_tag" value={segmentTag} />
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(variants.filter((v) => v.tag && v.template_id).map((v) => ({ ...v, subject: v.subject || undefined })))}
      />

      <Step n={1} title="Name it" hint="internal only — recipients never see it">
        <Input id="name" name="name" placeholder="July newsletter" required className="max-w-md" />
      </Step>

      <Step n={2} title="Who gets it?" hint="pick an audience" delay={0.05}>
        {lists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-4" /></span>
                <div>
                  <p className="text-sm font-medium">No audiences yet</p>
                  <p className="text-xs text-muted-foreground">An audience is a list of contacts. Create one, or import contacts from a file.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/contacts?tab=audiences&create=1" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"><ListChecks className="size-3.5" /> Create audience</Link>
                <Link href="/contacts?add=import" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">Import contacts</Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lists.map((l) => {
                const active = l.id === listId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setListId(l.id)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                      active ? "border-primary bg-primary/5" : "hover:border-primary/40",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">{l.contacts.toLocaleString()} contact{l.contacts === 1 ? "" : "s"}</span>
                    </span>
                    {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>

            {/* Optional segment: only members carrying a tag. */}
            <AnimatePresence initial={false}>
              {listId && tags && tags.length > 0 ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
                    <Tag className="size-4 text-muted-foreground" />
                    <span className="text-sm">Send to</span>
                    <Select value={segmentTag} onChange={(e) => setSegmentTag(e.target.value)} className="h-8 w-auto text-sm">
                      <option value="">everyone on the list</option>
                      {tags.map((t) => (
                        <option key={t.tag} value={t.tag}>
                          only contacts tagged “{t.tag}” ({t.contacts})
                        </option>
                      ))}
                    </Select>
                    {reach !== null ? (
                      <Badge variant="secondary" className="ml-auto tabular-nums">
                        {reach.toLocaleString()} recipient{reach === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        )}
      </Step>

      <Step n={3} title="What do they get?" hint="pick a template, or design a new one" delay={0.1}>
        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
                <div>
                  <p className="text-sm font-medium">No templates yet</p>
                  <p className="text-xs text-muted-foreground">Design the email once in the studio, then send it to any audience.</p>
                </div>
              </div>
              <Link href="/templates/new" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
                Open the design studio <ArrowRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {templates.map((t) => {
                const active = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      active ? "border-primary bg-primary/5" : "hover:border-primary/40",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      {active ? <Check className="size-4 shrink-0 text-primary" /> : <Badge variant="outline" className="shrink-0 text-[10px]">{t.type}</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">“{t.subject}”</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/templates/new" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Design a new one in the studio <ArrowRight className="size-3.5" />
              </Link>
              {templateId ? (
                <div className="flex min-w-56 flex-1 items-center gap-2">
                  <Label htmlFor="subject" className="shrink-0 text-xs text-muted-foreground">Subject override</Label>
                  <Input id="subject" name="subject" placeholder="(uses the template's subject)" className="h-8 text-sm" />
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Personalized for every recipient automatically: the template&apos;s{" "}
              <span className="font-mono">{"{{name}}"}</span>, <span className="font-mono">{"{{first_name}}"}</span> and any
              custom fields fill in from each contact&apos;s own record when it sends — no per-person setup.
            </p>
          </>
        )}
      </Step>

      {/* A/B by tags — only offered once an audience with tags + a base template exist. */}
      <AnimatePresence initial={false}>
        {ready && tags && tags.length > 0 && templates.length > 1 ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Step n={4} title="A/B by tags" hint="optional — different message for differently-tagged contacts">
              <p className="text-xs text-muted-foreground">
                Contacts carrying a variant&apos;s tag get that variant instead of the base message (first match wins).
                Compare how each lands in the campaign&apos;s analytics after sending.
              </p>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {variants.map((v, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
                        <Split className="size-4 shrink-0 text-primary" />
                        <span className="text-sm">Tagged</span>
                        <Select value={v.tag} onChange={(e) => patchVariant(i, { tag: e.target.value })} className="h-8 w-auto text-sm">
                          <option value="" disabled>pick a tag…</option>
                          {(tags ?? []).map((t) => (
                            <option key={t.tag} value={t.tag}>“{t.tag}” ({t.contacts})</option>
                          ))}
                        </Select>
                        <span className="text-sm">gets</span>
                        <Select value={v.template_id} onChange={(e) => patchVariant(i, { template_id: e.target.value })} className="h-8 w-auto max-w-52 text-sm">
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                        <Input
                          value={v.subject ?? ""}
                          onChange={(e) => patchVariant(i, { subject: e.target.value })}
                          placeholder="subject override (optional)"
                          className="h-8 min-w-40 flex-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariant(i)}
                          className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                          aria-label="Remove variant"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {variants.length < 4 ? (
                  <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                    <Plus className="size-4" /> Add a variant
                  </Button>
                ) : null}
              </div>
            </Step>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.15 }}
        className="space-y-3 border-t pt-5"
      >
        {/* Make the From explicit: their own verified address, or the rootmail
            fallback with a nudge to set one up. */}
        <p className="text-xs text-muted-foreground">
          Sends from{" "}
          {sendsFrom ? (
            <span className="font-medium text-foreground">{sendsFrom}</span>
          ) : (
            <>
              rootmail&apos;s address —{" "}
              <Link href="/settings/sender" className="text-primary hover:underline">verify your own</Link> to send as you
            </>
          )}
          .
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !ready}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {pending ? "Creating…" : "Create campaign"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Creates a draft — you review it and press send (or schedule) on the next screen.
            {reach !== null && ready ? ` Reaching ${reach.toLocaleString()} recipient${reach === 1 ? "" : "s"}.` : ""}
          </p>
        </div>
        {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      </motion.div>
    </form>
  );
}
