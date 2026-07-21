import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Trash2, TrendingUp, Upload, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { RevealPanel } from "@/components/app/reveal-panel";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { CONTACT_STAGES, STAGE_META, type ContactStage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { ApiError, api } from "@/lib/rootmail";
import type { Contact, ContactList, ListGrowth, ListMembers } from "@/lib/types";
import { addContact, removeContact } from "../actions";
import { GrowAudience } from "./grow-audience";

const PAGE_SIZE = 25;

interface Sp {
  q?: string;
  stage?: string;
  page?: string;
}

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Sp>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const stage = CONTACT_STAGES.includes(sp.stage as ContactStage) ? (sp.stage as ContactStage) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  let list: ContactList;
  let members: ListMembers;
  let growth: ListGrowth | null = null;
  let welcome: { id: string; name: string; status: string } | null = null;
  try {
    list = await api.getList(id);
    members = await api.getListContacts(id, {
      q: sp.q || undefined,
      stage,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    growth = await api.listGrowth(id).catch(() => null);
    // The welcome automation: a sequence triggered by this audience's signup tag.
    // Sequences are gated (mk_growth) — degrade quietly if not entitled.
    if (list.signup_tag) {
      const seqs = await api.listSequences().then((r) => r.data).catch(() => []);
      const s = seqs.find((x) => x.trigger.type === "contact_tagged" && x.trigger.tag === list.signup_tag);
      if (s) welcome = { id: s.id, name: s.name, status: s.status };
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const totalMembers = list.contacts;
  const stageTotal = CONTACT_STAGES.reduce((s, k) => s + (members.stages[k] ?? 0), 0);
  const activeFilters = Boolean(sp.q || stage);
  const empty = totalMembers === 0 && !activeFilters;
  const pages = Math.max(1, Math.ceil(members.total / PAGE_SIZE));

  const listUrl = (p: Partial<Sp>) => {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, stage, ...p })) if (v) usp.set(k, String(v));
    const s = usp.toString();
    return s ? `/lists/${id}?${s}` : `/lists/${id}`;
  };

  const addForm = (
    <form action={addContact} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={list.id} />
      <label className="flex-1">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
        <Input name="email" type="email" placeholder="contact@company.com" required className="min-w-56" />
      </label>
      <SubmitButton size="sm" pendingLabel="Adding…">
        <UserPlus className="size-4" /> Add to audience
      </SubmitButton>
    </form>
  );

  return (
    <>
      <PageHeader title={list.name} backHref="/contacts?tab=audiences" backLabel="Audiences" />

      {/* Hero — the audience at a glance: size + lifecycle mix, and a way to add */}
      <Reveal>
        <Card className="mb-6">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tabular-nums">{totalMembers.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">
                  {totalMembers === 1 ? "contact" : "contacts"} in this audience
                  {list.signup_enabled ? <span className="ml-1 text-emerald-600">· growing</span> : null}
                </p>
              </div>
              {!empty ? <RevealPanel triggerLabel="Add contact" title="Add a contact" description="New emails become contacts automatically.">{addForm}</RevealPanel> : null}
            </div>

            {/* Lifecycle mix — a segmented bar + clickable stage filters */}
            {stageTotal > 0 ? (
              <div className="space-y-2">
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  {CONTACT_STAGES.map((s) => {
                    const n = members.stages[s] ?? 0;
                    if (n === 0) return null;
                    return <div key={s} className={cn("h-full", STAGE_META[s].dot)} style={{ width: `${(n / stageTotal) * 100}%` }} title={`${STAGE_META[s].label}: ${n}`} />;
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CONTACT_STAGES.map((s) => {
                    const n = members.stages[s] ?? 0;
                    const active = stage === s;
                    return (
                      <Link
                        key={s}
                        href={active ? listUrl({ stage: undefined, page: undefined }) : listUrl({ stage: s, page: undefined })}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                          active ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          n === 0 && "opacity-50",
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", STAGE_META[s].dot)} /> {STAGE_META[s].label}
                        <span className="tabular-nums">{n.toLocaleString()}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </Reveal>

      {empty ? (
        /* From empty to scale: the three ways to fill an audience */
        <Reveal className="space-y-6" delay={0.05}>
          <div className="rounded-xl border border-dashed p-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Users className="size-6" />
            </span>
            <h2 className="mt-3 text-lg font-semibold">This audience is empty</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              Fill “{list.name}” three ways — let people subscribe themselves, bring a list, or add someone by hand.
            </p>
            <div className="mx-auto mt-5 grid max-w-2xl gap-3 sm:grid-cols-3">
              <a href="#grow" className="rounded-lg border p-4 text-left transition-colors hover:border-primary/50">
                <TrendingUp className="size-5 text-primary" />
                <p className="mt-2 text-sm font-semibold">Grow</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Turn on signup — share the page or embed the form.</p>
              </a>
              <Link href="/contacts?add=import" className="rounded-lg border p-4 text-left transition-colors hover:border-primary/50">
                <Upload className="size-5 text-primary" />
                <p className="mt-2 text-sm font-semibold">Import</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Bring a CSV, then group them into this audience.</p>
              </Link>
              <div className="rounded-lg border p-4 text-left">
                <UserPlus className="size-5 text-primary" />
                <p className="mt-2 text-sm font-semibold">Add by hand</p>
                <div className="mt-2">{addForm}</div>
              </div>
            </div>
          </div>
          <div id="grow">{growth ? <GrowAudience list={list} growth={growth} welcome={welcome} /> : null}</div>
        </Reveal>
      ) : (
        <Reveal className="space-y-4" delay={0.05}>
          {/* Search + stage filter (URL is the state) */}
          <div className="flex flex-wrap items-center gap-2">
            <form action={`/lists/${id}`} method="get" className="flex items-center gap-2">
              {stage ? <input type="hidden" name="stage" value={stage} /> : null}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search members…" className="w-60 pl-8" />
              </div>
              <Button type="submit" variant="secondary" size="sm">Search</Button>
            </form>
            {activeFilters ? (
              <Link href={`/lists/${id}`} className="text-sm text-muted-foreground hover:text-foreground">Clear</Link>
            ) : null}
            <span className="ml-auto text-sm text-muted-foreground">{members.total.toLocaleString()} matching</span>
          </div>

          {members.data.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="text-right">Joined</TableHead>
                      <TableHead className="w-10 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.data.map((c: Contact) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5 hover:underline">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                              {initials(c.name, c.email)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{c.name ?? c.email}</span>
                              {c.name ? <span className="block truncate text-xs text-muted-foreground">{c.email}</span> : null}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_META[c.stage].badge)}>
                            <span className={cn("size-1.5 rounded-full", STAGE_META[c.stage].dot)} /> {STAGE_META[c.stage].label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.tags.length ? (
                            <span className="flex flex-wrap gap-1">
                              {c.tags.slice(0, 3).map((t) => (
                                <Badge key={t} variant="secondary" className="font-mono text-[10px]">{t}</Badge>
                              ))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{relativeTime(c.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <form action={removeContact} className="inline">
                            <input type="hidden" name="id" value={list.id} />
                            <input type="hidden" name="contact_id" value={c.id} />
                            <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${c.email}`}>
                              <Trash2 className="size-4" />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">Nobody here matches — try a different search or stage.</CardContent>
            </Card>
          )}

          {pages > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, members.total).toLocaleString()} of {members.total.toLocaleString()}
              </span>
              <span className="flex gap-1">
                {page > 1 ? (
                  <Link href={listUrl({ page: String(page - 1) })} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-accent">
                    <ChevronLeft className="size-3.5" /> Prev
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link href={listUrl({ page: String(page + 1) })} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-accent">
                    Next <ChevronRight className="size-3.5" />
                  </Link>
                ) : null}
              </span>
            </div>
          ) : null}

          {/* Grow this audience — the scaling path, always available */}
          {growth ? <GrowAudience list={list} growth={growth} welcome={welcome} /> : null}
        </Reveal>
      )}
    </>
  );
}
