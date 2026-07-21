"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  CornerUpLeft,
  Loader2,
  Mail,
  MailCheck,
  MousePointerClick,
  PenSquare,
  Plus,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContactDetail, ContactList } from "@/lib/types";
import { POSITIVE_STAGES, STAGE_META, type ContactStage } from "@/lib/stages";

// The CRM view of one person: who they are (editable), where they belong
// (audiences), what you know (notes, custom fields), and everything that's
// happened (lifecycle + sends, newest first). Every action a relationship
// needs — email them, tag them, move them, pause them, win them back.

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const EVENT_META: Record<string, { label: string; Icon: typeof Mail; tone: string }> = {
  subscribed: { label: "Subscribed", Icon: UserPlus, tone: "text-emerald-600" },
  confirmed: { label: "Confirmed subscription", Icon: MailCheck, tone: "text-emerald-600" },
  unsubscribed: { label: "Unsubscribed", Icon: UserX, tone: "text-red-500" },
  imported: { label: "Imported", Icon: UserPlus, tone: "text-muted-foreground" },
  waitlisted: { label: "Waitlisted (no contact room)", Icon: Ban, tone: "text-amber-600" },
  admitted: { label: "Admitted from the waitlist", Icon: UserCheck, tone: "text-emerald-600" },
  stage_changed: { label: "Stage changed", Icon: UserCheck, tone: "text-primary" },
};

export function ContactCrm({ contact, allLists }: { contact: ContactDetail; allLists: ContactList[] }) {
  const router = useRouter();
  const [name, setName] = useState(contact.name ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [fields, setFields] = useState<{ key: string; value: string }[]>(
    Object.entries(contact.metadata).map(([key, value]) => ({ key, value: String(value) })),
  );
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState(contact.notes);
  const [audiences, setAudiences] = useState(contact.lists);
  const [addList, setAddList] = useState("");
  const [status, setStatus] = useState(contact.status);
  const [stage, setStage] = useState<ContactStage>(contact.stage);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const availableLists = useMemo(
    () => allLists.filter((l) => !audiences.some((a) => a.id === l.id)),
    [allLists, audiences],
  );

  const saveProfile = () =>
    start(async () => {
      setMsg(null);
      const metadata: Record<string, unknown> = {};
      for (const f of fields) if (f.key.trim()) metadata[f.key.trim()] = f.value;
      const res = await updateContactAction(contact.id, { name: name.trim() || null, phone: phone.trim() || null, metadata });
      setMsg(res.error ? { error: res.error } : { ok: "Saved" });
    });

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
      const res = await updateContactAction(contact.id, { status: next });
      if (res.error) return setMsg({ error: res.error });
      setStatus(next);
      router.refresh();
    });

  const setStageTo = (next: ContactStage) =>
    start(async () => {
      setMsg(null);
      const prev = stage;
      setStage(next);
      const res = await updateContactAction(contact.id, { stage: next });
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

  // One merged lifeline: lifecycle events + sends, newest first.
  const timeline = useMemo(() => {
    const items: { at: string; node: React.ReactNode; key: string }[] = [];
    for (const e of contact.events) {
      const meta = EVENT_META[e.kind] ?? { label: e.kind, Icon: StickyNote, tone: "text-muted-foreground" };
      items.push({
        at: e.occurred_at,
        key: `e-${e.id}`,
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
        key: `m-${m.id}`,
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
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 60);
  }, [contact.events, contact.recent_messages]);

  return (
    <div className="space-y-6">
      {/* Who + the relationship controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contact.name, contact.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{contact.name ?? contact.email}</p>
            <p className="truncate text-sm text-muted-foreground">{contact.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === "active" ? "success" : status === "unsubscribed" ? "secondary" : "warning"}>{status}</Badge>
            {contact.suppressed ? <Badge variant="warning">suppressed</Badge> : null}
            <Link
              href={`/messages/new?to=${encodeURIComponent(contact.email)}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <PenSquare className="size-3.5" /> Email them
            </Link>
            <Link href="/inbox" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <CornerUpLeft className="size-3.5" /> Conversations
            </Link>
            {status === "active" ? (
              <Button variant="outline" size="sm" onClick={() => setLifecycle("unsubscribed")} disabled={pending}>
                <UserX className="size-3.5" /> Unsubscribe
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setLifecycle("active")} disabled={pending}>
                <UserCheck className="size-3.5" /> Resubscribe
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (window.confirm(`Delete ${contact.email}? Their audiences and notes go too; sent history stays.`)) remove();
              }}
              disabled={pending}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* The relationship pipeline — click a stage to move them (like a real CRM).
          "At risk" is the side lane: pull them in when they cool, back out when they warm. */}
      <Card>
        <CardContent className="space-y-2.5 p-4">
          <div className="flex items-stretch overflow-hidden rounded-lg border">
            {POSITIVE_STAGES.map((s2, i) => {
              const currentIdx = POSITIVE_STAGES.indexOf(stage as (typeof POSITIVE_STAGES)[number]);
              const atRisk = stage === "at_risk";
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
                        : "bg-muted/30 text-muted-foreground hover:bg-muted",
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
              {stage === "at_risk"
                ? "In the at-risk lane — a win-back email or sequence is the usual next move."
                : stage === "champion"
                  ? "A champion — your best kind of customer. 🎉"
                  : `${STAGE_META[stage].label} · click ahead to escalate, back to de-escalate`}
            </span>
            {stage === "at_risk" ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setStageTo("engaged")}>
                Back on track
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setStageTo("at_risk")}
                className="text-muted-foreground hover:text-destructive"
              >
                Mark at risk
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {msg?.error ? <p className="text-sm text-destructive">{msg.error}</p> : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Profile + custom fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 …" />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Custom fields <span className="font-normal">— fill templates as {"{{field_name}}"}</span>
                </p>
                <div className="space-y-1.5">
                  {fields.map((f, i) => (
                    <div key={i} className="flex gap-1.5">
                      <Input value={f.key} onChange={(e) => setFields((s) => s.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="plan" className="h-8 w-36 font-mono text-xs" />
                      <Input value={f.value} onChange={(e) => setFields((s) => s.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Growth" className="h-8 flex-1 text-xs" />
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => setFields((s) => s.filter((_, j) => j !== i))}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setFields((s) => [...s, { key: "", value: "" }])}>
                    <Plus className="size-3.5" /> Add field
                  </Button>
                </div>
              </div>
              <Button size="sm" onClick={saveProfile} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save profile
              </Button>
              {msg?.ok ? <span className="ml-2 text-sm text-emerald-600">{msg.ok}</span> : null}
            </CardContent>
          </Card>

          {/* Tags (automation hooks) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                    {t}
                    <button type="button" onClick={() => saveTags(tags.filter((x) => x !== t))} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${t}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = tagDraft.trim();
                    if (t && !tags.includes(t)) saveTags([...tags, t]);
                    setTagDraft("");
                  }}
                  className="flex items-center gap-1"
                >
                  <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="add a tag…" className="h-7 w-32 text-xs" />
                  <Button type="submit" variant="outline" size="sm" className="h-7 px-2" disabled={pending}>
                    <Plus className="size-3" />
                  </Button>
                </form>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Tags move people through your world — a tag can trigger a sequence, target a campaign variant, or become
                an audience.
              </p>
            </CardContent>
          </Card>

          {/* Audiences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audiences</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-1.5">
                {audiences.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
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
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove from ${a.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {audiences.length === 0 ? <span className="text-xs text-muted-foreground">Not in any audience yet.</span> : null}
              </div>
              {availableLists.length > 0 ? (
                <div className="mt-3 flex items-center gap-2">
                  <Select value={addList} onChange={(e) => setAddList(e.target.value)} className="h-8 w-auto text-xs">
                    <option value="">Add to audience…</option>
                    {availableLists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || !addList}
                    onClick={() =>
                      start(async () => {
                        const res = await addToAudienceAction(contact.id, addList);
                        if (!res.error) {
                          const l = allLists.find((x) => x.id === addList);
                          if (l) setAudiences((s) => [...s, { id: l.id, name: l.name }]);
                          setAddList("");
                        } else setMsg({ error: res.error });
                      })
                    }
                  >
                    <Plus className="size-3.5" /> Add
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2">
                <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2} placeholder="Met at the conference — wants the annual plan…" className="min-h-0" />
                <Button
                  size="sm"
                  disabled={pending || !noteDraft.trim()}
                  onClick={() =>
                    start(async () => {
                      const res = await addNoteAction(contact.id, noteDraft.trim());
                      if (res.note) {
                        setNotes((s) => [res.note!, ...s]);
                        setNoteDraft("");
                      } else if (res.error) setMsg({ error: res.error });
                    })
                  }
                >
                  <StickyNote className="size-3.5" /> Add
                </Button>
              </div>
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="group flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm">
                    <span className="min-w-0 whitespace-pre-wrap">{n.body}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{relativeTime(n.created_at)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          start(async () => {
                            const res = await deleteNoteAction(contact.id, n.id);
                            if (!res.error) setNotes((s) => s.filter((x) => x.id !== n.id));
                          })
                        }
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete note"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
                {notes.length === 0 ? <li className="text-xs text-muted-foreground">No notes yet — whatever you'd scribble in a CRM goes here.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* The whole story, newest first */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {timeline.map((t) => (
                <li key={t.key} className="flex items-start justify-between gap-3 border-b pb-3 last:border-none last:pb-0">
                  <div className="min-w-0 flex-1">{t.node}</div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(t.at)}</span>
                </li>
              ))}
              {timeline.length === 0 ? (
                <li className="text-sm text-muted-foreground">Nothing yet — their subscribes, emails, opens and clicks will show up here.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
