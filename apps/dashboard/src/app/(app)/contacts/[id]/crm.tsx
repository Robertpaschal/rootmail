"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Check,
  Copy,
  CornerUpLeft,
  Loader2,
  Mail,
  MailCheck,
  MessageSquare,
  MousePointerClick,
  MoreHorizontal,
  Pencil,
  PenSquare,
  Plus,
  Sparkles,
  StickyNote,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import {
  addNoteAction,
  addToAudienceAction,
  deleteContactAction,
  deleteNoteAction,
  removeFromAudienceAction,
  updateContactAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContactDetail, ContactList, ContactNote } from "@/lib/types";
import { POSITIVE_STAGES, STAGE_META, suggestStage, type ContactStage } from "@/lib/stages";

// One customer, one page, three answers in order: WHO they are (identity, how
// the relationship is going, where they are in it), then side by side the
// RECORD (every fact as a row in one list) and the STORY (notes, replies, and
// everything that has happened).
//
// The record used to be three sections — Details, Tags, Audiences — each with
// its own uppercase heading and its own button. For a contact with a name and
// nothing else that is three lines of content inside 274px of chrome, and it
// read, correctly, as a stack of separate boxes. Facts about one person belong
// in one list. The header gained the engagement numbers for the same reason:
// the page could not previously tell you how the relationship was going without
// making you read the timeline and count.

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const EVENT_META: Record<string, { label: string; Icon: typeof Mail; tone: string; dot: string }> = {
  subscribed: { label: "Subscribed", Icon: UserPlus, tone: "text-emerald-600", dot: "bg-emerald-500" },
  confirmed: { label: "Confirmed subscription", Icon: MailCheck, tone: "text-emerald-600", dot: "bg-emerald-500" },
  unsubscribed: { label: "Unsubscribed", Icon: UserX, tone: "text-red-500", dot: "bg-red-500" },
  imported: { label: "Imported", Icon: UserPlus, tone: "text-muted-foreground", dot: "bg-muted-foreground" },
  waitlisted: { label: "Waitlisted (no contact room)", Icon: Ban, tone: "text-amber-600", dot: "bg-amber-500" },
  admitted: { label: "Admitted from the waitlist", Icon: UserCheck, tone: "text-emerald-600", dot: "bg-emerald-500" },
  stage_changed: { label: "Stage changed", Icon: UserCheck, tone: "text-primary", dot: "bg-primary" },
};

/** A conversation with this contact, as passed down from the server page. */
export interface ContactThreadSummary {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
}

export function ContactCrm({
  contact,
  allLists,
  threads = [],
}: {
  contact: ContactDetail;
  allLists: ContactList[];
  threads?: ContactThreadSummary[];
}) {
  const router = useRouter();
  const [name, setName] = useState(contact.name ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const initialFields = useMemo(
    () => Object.entries(contact.metadata).map(([key, value]) => ({ key, value: String(value) })),
    [contact.metadata],
  );
  const [fields, setFields] = useState<{ key: string; value: string }[]>(initialFields);
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState(contact.notes);
  const [audiences, setAudiences] = useState(contact.lists);
  const [addList, setAddList] = useState("");
  const [status, setStatus] = useState(contact.status);
  const [stage, setStage] = useState<ContactStage>(contact.stage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  // View-first section toggles — present the data; reveal editing/adding on demand.
  const [editDetails, setEditDetails] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [addingAudience, setAddingAudience] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  const availableLists = useMemo(
    () => allLists.filter((l) => !audiences.some((a) => a.id === l.id)),
    [allLists, audiences],
  );

  const cleanFields = useMemo(() => fields.filter((f) => f.key.trim()), [fields]);
  const suggestion = useMemo(() => suggestStage(stage, contact.recent_messages), [stage, contact.recent_messages]);

  const saveProfile = () =>
    start(async () => {
      setMsg(null);
      const metadata: Record<string, unknown> = {};
      for (const f of fields) if (f.key.trim()) metadata[f.key.trim()] = f.value;
      const res = await updateContactAction(contact.id, { name: name.trim() || null, phone: phone.trim() || null, metadata });
      if (res.error) return setMsg({ error: res.error });
      setEditDetails(false);
      setMsg({ ok: "Saved" });
      router.refresh();
    });

  const cancelDetails = () => {
    setName(contact.name ?? "");
    setPhone(contact.phone ?? "");
    setFields(initialFields);
    setEditDetails(false);
  };

  const saveTags = (next: string[]) =>
    start(async () => {
      setMsg(null);
      setTags(next);
      const res = await updateContactAction(contact.id, { tags: next });
      if (res.error) setMsg({ error: res.error });
    });

  const setLifecycle = (next: "active" | "unsubscribed") =>
    start(async () => {
      setMsg(null);
      setMenuOpen(false);
      const res = await updateContactAction(contact.id, { status: next });
      if (res.error) return setMsg({ error: res.error });
      setStatus(next);
      router.refresh();
    });

  const setStageTo = (next: ContactStage) =>
    start(async () => {
      setMsg(null);
      setSuggestBusy(true);
      const prev = stage;
      setStage(next);
      const res = await updateContactAction(contact.id, { stage: next });
      setSuggestBusy(false);
      if (res.error) {
        setStage(prev);
        setMsg({ error: res.error });
      } else router.refresh();
    });

  const remove = () =>
    start(async () => {
      const res = await deleteContactAction(contact.id);
      if (res?.error) setMsg({ error: res.error });
    });

  const addNote = () =>
    start(async () => {
      const res = await addNoteAction(contact.id, noteDraft.trim());
      if (res.note) {
        setNotes((s) => [res.note!, ...s]);
        setNoteDraft("");
        setAddingNote(false);
      } else if (res.error) setMsg({ error: res.error });
    });

  const removeNote = (id: string) =>
    start(async () => {
      const res = await deleteNoteAction(contact.id, id);
      if (!res.error) setNotes((s) => s.filter((x) => x.id !== id));
    });

  // One feed: notes + lifecycle events + sends, newest first. A note is activity too.
  const feed = useMemo(() => {
    const items: { at: string; kind: "note" | "event" | "message"; key: string; dot: string; node: React.ReactNode }[] = [];
    for (const n of notes) {
      items.push({ at: n.created_at, kind: "note", key: `n-${n.id}`, dot: "bg-amber-400", node: <NoteRow note={n} onDelete={() => removeNote(n.id)} /> });
    }
    for (const e of contact.events) {
      const meta = EVENT_META[e.kind] ?? { label: e.kind, Icon: StickyNote, tone: "text-muted-foreground", dot: "bg-muted-foreground" };
      items.push({
        at: e.occurred_at,
        kind: "event",
        key: `e-${e.id}`,
        dot: meta.dot,
        node: (
          <span className="flex items-center gap-2 text-sm">
            <meta.Icon className={cn("size-4 shrink-0", meta.tone)} />
            <span>
              {e.kind === "stage_changed" && typeof e.metadata?.to === "string"
                ? `Moved to ${STAGE_META[e.metadata.to as ContactStage]?.label ?? String(e.metadata.to)}`
                : meta.label}
              {e.kind === "stage_changed" && typeof e.metadata?.from === "string" ? (
                <span className="text-muted-foreground"> (from {STAGE_META[e.metadata.from as ContactStage]?.label ?? String(e.metadata.from)})</span>
              ) : null}
              {e.list_name ? <span className="text-muted-foreground"> · {e.list_name}</span> : null}
              {typeof e.metadata?.source === "string" ? <span className="text-muted-foreground"> · via {String(e.metadata.source)}</span> : null}
            </span>
          </span>
        ),
      });
    }
    for (const m of contact.recent_messages) {
      items.push({
        at: m.sent_at,
        kind: "message",
        key: `m-${m.id}`,
        dot: m.clicked_at ? "bg-blue-600" : m.opened_at ? "bg-violet-500" : "bg-blue-400",
        node: (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <Mail className="size-4 shrink-0 text-blue-500" />
            <Link href={`/messages/${m.id}`} className="min-w-0 truncate font-medium hover:underline">
              {m.subject}
            </Link>
            <span className="text-xs text-muted-foreground">{m.kind}</span>
            {m.clicked_at ? (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600"><MousePointerClick className="size-3" /> clicked</span>
            ) : m.opened_at ? (
              <span className="text-xs text-violet-600">opened</span>
            ) : (
              <span className="text-xs text-muted-foreground">{m.status}</span>
            )}
          </span>
        ),
      });
    }
    return items.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [contact.events, contact.recent_messages, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentIdx = POSITIVE_STAGES.indexOf(stage as (typeof POSITIVE_STAGES)[number]);
  const atRisk = stage === "at_risk";
  const hasDetails = Boolean(contact.name || contact.phone || cleanFields.length);

  /**
   * How the relationship is going, at a glance.
   *
   * The page used to leave this implicit — you had to read the timeline and do
   * the counting yourself, which is a large part of why it felt unfinished.
   *
   * `recent_messages` is capped at 20 by the API, so these are counts over what
   * we hold, NOT lifetime totals. `capped` drives a qualifier in the UI rather
   * than letting "8 opened" quietly imply it is the whole story.
   */
  const stats = useMemo(() => {
    const msgs = contact.recent_messages;
    const times = [
      ...msgs.map((m) => m.sent_at),
      ...contact.events.map((e) => e.occurred_at),
    ].sort();
    return {
      sent: msgs.length,
      opened: msgs.filter((m) => m.opened_at).length,
      clicked: msgs.filter((m) => m.clicked_at).length,
      lastAt: times.length ? times[times.length - 1] : null,
      capped: msgs.length >= 20,
    };
  }, [contact.recent_messages, contact.events]);

  return (
    <div className="space-y-5">
      {/* ── WHO THEY ARE ──────────────────────────────────────────────────────
          One continuous header: identity, then how the relationship is going,
          then where they are in it. These used to be a card and a detached
          strip; they are one surface because they answer one question. */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 p-5 pb-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contact.name, contact.email)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-semibold leading-tight">{contact.name ?? contact.email}</p>
              <Badge variant={status === "active" ? "success" : status === "unsubscribed" ? "secondary" : "warning"}>{status}</Badge>
              {contact.suppressed ? <Badge variant="warning">suppressed</Badge> : null}
            </div>
            {/* With no name the title IS the address, so repeating it here says
                nothing. Offer the missing name instead — the subline earns its
                place either way. */}
            {contact.name ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(contact.email);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                }}
                className="group mt-0.5 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                title="Copy email address"
              >
                <span className="truncate">{contact.email}</span>
                {copied ? (
                  <Check className="size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditDetails(true)}
                className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                <Pencil className="size-3.5" /> Add a name
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/messages/new?to=${encodeURIComponent(contact.email)}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <PenSquare className="size-3.5" /> Email them
            </Link>
            <Link href="/inbox" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <CornerUpLeft className="size-3.5" /> Conversations
            </Link>
            <div className="relative">
              <Button variant="ghost" size="icon" className="size-9" onClick={() => setMenuOpen((o) => !o)} disabled={pending} aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
              <AnimatePresence>
                {menuOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
                    >
                      {status === "active" ? (
                        <button type="button" onClick={() => setLifecycle("unsubscribed")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent">
                          <UserX className="size-3.5" /> Unsubscribe
                        </button>
                      ) : (
                        <button type="button" onClick={() => setLifecycle("active")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent">
                          <UserCheck className="size-3.5" /> Resubscribe
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          if (window.confirm(`Delete ${contact.email}? Their audiences and notes go too; sent history stays.`)) remove();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" /> Delete contact
                      </button>
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* How the relationship is actually going. The page used to make you
            read the timeline and infer this, which is why it felt unfinished.
            Counts are over the sends we hold (capped at 20), so the label says
            so rather than implying a lifetime total it cannot know. */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-t px-5 py-3">
          {stats.sent > 0 ? (
            <>
              <Stat label={stats.sent === 1 ? "email sent" : "emails sent"} value={String(stats.sent)} />
              <Stat
                label="opened"
                value={`${stats.opened}`}
                sub={stats.sent ? `${Math.round((stats.opened / stats.sent) * 100)}%` : undefined}
                tone={stats.opened > 0 ? "text-violet-600 dark:text-violet-400" : undefined}
              />
              <Stat
                label="clicked"
                value={`${stats.clicked}`}
                sub={stats.sent ? `${Math.round((stats.clicked / stats.sent) * 100)}%` : undefined}
                tone={stats.clicked > 0 ? "text-blue-600 dark:text-blue-400" : undefined}
              />
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              You haven&apos;t emailed them yet — engagement shows up here once you do.
            </span>
          )}
          {stats.lastAt ? <Stat label="last activity" value={relativeTime(stats.lastAt)} /> : null}
          <Stat label="added" value={new Date(contact.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} />
          {stats.capped ? (
            <span className="text-[11px] text-muted-foreground/70">across their 20 most recent emails</span>
          ) : null}
        </div>

        {/* Where they are in the relationship — click a stage to move them. */}
        <div className="space-y-2.5 border-t bg-muted/20 px-5 py-3.5">
          <div className="flex items-stretch overflow-hidden rounded-lg border bg-background">
            {POSITIVE_STAGES.map((s2, i) => {
              const reached = !atRisk && currentIdx >= i;
              const isCurrent = !atRisk && currentIdx === i;
              return (
                <button
                  key={s2}
                  type="button"
                  disabled={pending}
                  onClick={() => setStageTo(s2)}
                  title={STAGE_META[s2].hint}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center border-r px-2 text-xs transition-colors last:border-r-0",
                    s2 === "champion" && reached
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : reached
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-transparent text-muted-foreground hover:bg-muted",
                    isCurrent ? "font-semibold" : "font-medium",
                  )}
                >
                  {STAGE_META[s2].label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {atRisk
                ? "In the at-risk lane — a win-back email or sequence is the usual next move."
                : stage === "champion"
                  ? "A champion — your best kind of customer. 🎉"
                  : `${STAGE_META[stage].label} · click ahead to escalate, back to de-escalate`}
            </span>
            {atRisk ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setStageTo("engaged")}>
                Back on track
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStageTo("at_risk")} className="text-muted-foreground hover:text-destructive">
                Mark at risk
              </Button>
            )}
          </div>

          {/* Auto-suggestion from real engagement — one click to accept */}
          <AnimatePresence>
            {suggestion ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
              >
                <Sparkles className="size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  Looks like <span className="font-medium">{STAGE_META[suggestion.to].label}</span>
                  <span className="text-muted-foreground"> — {suggestion.reason}.</span>
                </span>
                <Button size="sm" className="ml-auto h-7" disabled={pending || suggestBusy} onClick={() => setStageTo(suggestion.to)}>
                  {suggestBusy ? <Loader2 className="size-3.5 animate-spin" /> : null} Move to {STAGE_META[suggestion.to].label}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </Card>

      {msg?.error ? <p className="text-sm text-destructive">{msg.error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,340px)_1fr] lg:items-start">
        {/* ── THE RECORD ───────────────────────────────────────────────────
            ONE card, ONE header, and rows. Details, tags and audiences used to
            be three sections, each with its own uppercase heading and its own
            button — three lines of content wearing three sets of chrome, which
            is what read as "separate boxes". They are facts about one person,
            so they are now rows in one list. */}
        <Card>
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Profile</h2>
            {!editDetails ? (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => setEditDetails(true)}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7" onClick={cancelDetails} disabled={pending}>Cancel</Button>
                <Button size="sm" className="h-7" onClick={saveProfile} disabled={pending}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
                </Button>
              </div>
            )}
          </div>

          <div className="p-4">
            {!editDetails ? (
              <dl className="space-y-3 text-sm">
                <FieldRow label="Email">
                  <span className="break-all">{contact.email}</span>
                </FieldRow>
                {contact.name ? <FieldRow label="Name">{contact.name}</FieldRow> : null}
                {contact.phone ? <FieldRow label="Phone">{contact.phone}</FieldRow> : null}
                {cleanFields.map((f) => (
                  <FieldRow key={f.key} label={f.key} mono>
                    {f.value}
                  </FieldRow>
                ))}

                {/* Tags and audiences are rows on the same record, not sections
                    of their own. The add affordance lives in the row. */}
                <FieldRow
                  label="Tags"
                  action={
                    <button
                      type="button"
                      onClick={() => setAddingTag((v) => !v)}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={addingTag ? "Done adding tags" : "Add a tag"}
                    >
                      {addingTag ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                    </button>
                  }
                >
                  {tags.length ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tags.map((t) => (
                        <span key={t} className="group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                          {t}
                          <button type="button" onClick={() => saveTags(tags.filter((x) => x !== t))} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label={`Remove ${t}`}>
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : !addingTag ? (
                    <span className="text-muted-foreground">None</span>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {addingTag ? (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const t = tagDraft.trim();
                            if (t && !tags.includes(t)) saveTags([...tags, t]);
                            setTagDraft("");
                          }}
                          className="mt-1.5 flex items-center gap-1"
                        >
                          <Input autoFocus value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="add a tag…" className="h-7 flex-1 text-xs" />
                          <Button type="submit" variant="outline" size="sm" className="h-7 px-2" disabled={pending}>
                            <Plus className="size-3.5" />
                          </Button>
                        </form>
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          A tag can trigger a sequence, target a campaign variant, or become an audience.
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </FieldRow>

                <FieldRow
                  label="Audiences"
                  action={
                    availableLists.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAddingAudience((v) => !v)}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={addingAudience ? "Done adding audiences" : "Add to an audience"}
                      >
                        {addingAudience ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                      </button>
                    ) : null
                  }
                >
                  {audiences.length ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {audiences.map((a) => (
                        <span key={a.id} className="group inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2 py-0.5 text-xs font-medium">
                          <Link href={`/lists/${a.id}`} className="hover:underline">{a.name}</Link>
                          <button
                            type="button"
                            onClick={() =>
                              start(async () => {
                                const res = await removeFromAudienceAction(contact.id, a.id);
                                if (!res.error) setAudiences((s) => s.filter((x) => x.id !== a.id));
                                else setMsg({ error: res.error });
                              })
                            }
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            aria-label={`Remove from ${a.name}`}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : !addingAudience ? (
                    <span className="text-muted-foreground">None</span>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {addingAudience && availableLists.length > 0 ? (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Select value={addList} onChange={(e) => setAddList(e.target.value)} className="h-7 flex-1 text-xs">
                            <option value="">Add to audience…</option>
                            {availableLists.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2"
                            disabled={pending || !addList}
                            onClick={() =>
                              start(async () => {
                                const res = await addToAudienceAction(contact.id, addList);
                                if (!res.error) {
                                  const l = allLists.find((x) => x.id === addList);
                                  if (l) setAudiences((s) => [...s, { id: l.id, name: l.name }]);
                                  setAddList("");
                                  if (availableLists.length <= 1) setAddingAudience(false);
                                } else setMsg({ error: res.error });
                              })
                            }
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </FieldRow>

                {/* An empty record should invite, not just report emptiness. */}
                {!hasDetails ? (
                  <button
                    type="button"
                    onClick={() => setEditDetails(true)}
                    className="mt-1 w-full rounded-lg border border-dashed px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    Add a name, phone, or custom fields — they fill your templates as{" "}
                    <span className="font-mono">{"{{field_name}}"}</span>.
                  </button>
                ) : null}
              </dl>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Phone</span>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 …" />
                </label>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Custom fields <span className="font-normal">— fill templates as {"{{field_name}}"}</span>
                  </p>
                  <div className="space-y-1.5">
                    {fields.map((f, i) => (
                      <div key={i} className="flex gap-1.5">
                        <Input value={f.key} onChange={(e) => setFields((s) => s.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="plan" className="h-8 w-28 font-mono text-xs" />
                        <Input value={f.value} onChange={(e) => setFields((s) => s.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Growth" className="h-8 flex-1 text-xs" />
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => setFields((s) => s.filter((_, j) => j !== i))}>
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setFields((s) => [...s, { key: "", value: "" }])}>
                      <Plus className="size-3.5" /> Add field
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
        {/* THE STORY — note composer over the capped, scrolling activity feed */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b p-4">
            <h3 className="text-sm font-semibold">Activity</h3>
            <Button size="sm" variant={addingNote ? "outline" : "default"} className="h-7" onClick={() => setAddingNote((v) => !v)}>
              {addingNote ? <X className="size-3.5" /> : <StickyNote className="size-3.5" />} {addingNote ? "Cancel" : "Add note"}
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {addingNote ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b">
                <div className="flex items-end gap-2 p-4">
                  <Textarea autoFocus value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2} placeholder="Met at the conference, wants the annual plan…" className="min-h-0" />
                  <Button size="sm" disabled={pending || !noteDraft.trim()} onClick={addNote}>
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Save
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {/* Live conversations sit atop the story — replies are the relationship
              talking BACK, so they lead into the timeline below. */}
          {threads.length > 0 ? (
            <div className="border-b p-3">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conversations
              </p>
              {threads.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/inbox/${t.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary/60"
                >
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
                  {t.status === "needs_reply" ? (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      Needs reply
                    </span>
                  ) : t.status === "closed" ? (
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Closed
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(t.last_message_at)}</span>
                </Link>
              ))}
            </div>
          ) : null}
          <div className="max-h-[32rem] overflow-y-auto p-4">
            {feed.length ? (
              <ul className="relative space-y-4 border-l border-border/70 pl-5">
                {feed.map((t) => (
                  <li key={t.key} className="relative">
                    <span className={cn("absolute -left-[27px] top-1 size-2.5 rounded-full ring-4 ring-card", t.dot)} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">{t.node}</div>
                      {t.kind !== "note" ? <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(t.at)}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing yet — notes you add, plus their subscribes, emails, opens and clicks, all land here.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * One fact about this person: a quiet label on the left, the value on the right.
 *
 * Every row on the record uses this — name, phone, a synced trait, their tags,
 * their audiences. That sameness is the point: previously tags and audiences
 * each carried a section heading and a button of their own, so three short
 * facts wore three sets of chrome and read as three separate boxes.
 */
function FieldRow({
  label,
  children,
  mono,
  action,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-start gap-3">
      <dt className="flex items-center gap-1 pt-px text-xs capitalize text-muted-foreground">
        {label}
        {action}
      </dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}

/** A number in the header strip — value large, label quiet, optional rate. */
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</span>
      {sub ? <span className="text-xs text-muted-foreground tabular-nums">({sub})</span> : null}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** A note rendered inside the activity feed — distinct card styling, author + delete. */
function NoteRow({ note, onDelete }: { note: ContactNote; onDelete: () => void }) {
  return (
    <div className="group rounded-lg border border-amber-300/50 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <StickyNote className="size-3.5" /> Note
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{relativeTime(note.created_at)}</span>
          <button type="button" onClick={onDelete} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Delete note">
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
    </div>
  );
}
