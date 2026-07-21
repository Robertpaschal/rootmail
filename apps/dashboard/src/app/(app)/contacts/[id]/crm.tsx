"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Check,
  CornerUpLeft,
  Loader2,
  Mail,
  MailCheck,
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

// One customer, one page. An identity band up top (who + lifecycle + actions),
// then two columns that read as one surface: the RECORD on the left (details,
// tags, audiences — presented, edited on demand) and the STORY on the right
// (a note composer over one capped, scrolling timeline of notes + events + sends).

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

/** A quiet section inside the record card — title + an optional header action. */
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ContactCrm({ contact, allLists }: { contact: ContactDetail; allLists: ContactList[] }) {
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

  return (
    <div className="space-y-6">
      {/* Identity band — who, where in the lifecycle, and what to do */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contact.name, contact.email)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-semibold">{contact.name ?? contact.email}</p>
              <Badge variant={status === "active" ? "success" : status === "unsubscribed" ? "secondary" : "warning"}>{status}</Badge>
              {contact.suppressed ? <Badge variant="warning">suppressed</Badge> : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">{contact.email}</p>
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

        {/* Lifecycle pipeline — click a stage to move them */}
        <div className="space-y-2.5 border-t bg-muted/20 p-4">
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
                    "flex h-10 flex-1 items-center justify-center border-r px-2 text-xs transition-colors last:border-r-0",
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

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr] lg:items-start">
        {/* THE RECORD — presented, edited on demand */}
        <Card className="divide-y">
          {/* Details */}
          <Section
            title="Details"
            action={
              !editDetails ? (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => setEditDetails(true)}>
                  <Pencil className="size-3.5" /> {hasDetails ? "Edit" : "Add"}
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7" onClick={cancelDetails} disabled={pending}>Cancel</Button>
                  <Button size="sm" className="h-7" onClick={saveProfile} disabled={pending}>
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
                  </Button>
                </div>
              )
            }
          >
            {!editDetails ? (
              hasDetails ? (
                <dl className="space-y-2 text-sm">
                  {contact.name ? <Row label="Name" value={contact.name} /> : null}
                  {contact.phone ? <Row label="Phone" value={contact.phone} /> : null}
                  {cleanFields.map((f) => (
                    <Row key={f.key} label={f.key} value={f.value} mono />
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No details yet — add a name, phone, or custom fields that fill your templates.</p>
              )
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
                        <Input value={f.key} onChange={(e) => setFields((s) => s.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="plan" className="h-8 w-32 font-mono text-xs" />
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
          </Section>

          {/* Tags */}
          <Section
            title="Tags"
            action={
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => setAddingTag((v) => !v)}>
                {addingTag ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {addingTag ? "Done" : "Add"}
              </Button>
            }
          >
            {tags.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="group inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                    {t}
                    <button type="button" onClick={() => saveTags(tags.filter((x) => x !== t))} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label={`Remove ${t}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : !addingTag ? (
              <p className="text-sm text-muted-foreground">No tags yet.</p>
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
                    className="mt-2 flex items-center gap-1"
                  >
                    <Input autoFocus value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="add a tag…" className="h-8 flex-1 text-xs" />
                    <Button type="submit" variant="outline" size="sm" className="h-8 px-2" disabled={pending}>
                      <Plus className="size-3.5" />
                    </Button>
                  </form>
                  <p className="mt-1.5 text-xs text-muted-foreground">A tag can trigger a sequence, target a campaign variant, or become an audience.</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Section>

          {/* Audiences */}
          <Section
            title="Audiences"
            action={
              availableLists.length > 0 ? (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => setAddingAudience((v) => !v)}>
                  {addingAudience ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {addingAudience ? "Done" : "Add"}
                </Button>
              ) : null
            }
          >
            {audiences.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {audiences.map((a) => (
                  <span key={a.id} className="group inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
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
              <p className="text-sm text-muted-foreground">Not in any audience yet.</p>
            ) : null}
            <AnimatePresence initial={false}>
              {addingAudience && availableLists.length > 0 ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-2 flex items-center gap-2">
                    <Select value={addList} onChange={(e) => setAddList(e.target.value)} className="h-8 flex-1 text-xs">
                      <option value="">Add to audience…</option>
                      {availableLists.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
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
                      <Plus className="size-3.5" /> Add
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Section>
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

/** A presented key/value row in the Details view. */
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs capitalize text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right", mono && "font-mono text-xs")}>{value}</dd>
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
