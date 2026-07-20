import type { ReactNode } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { audienceFromTagAction, unsubscribeContact } from "./actions";
import { deleteList } from "../lists/actions";
import { AddPeople } from "./add-people";
import { NewAudience } from "./new-audience";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { ContactStatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalTime } from "@/components/app/local-time";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";
import type { Contact, ContactList, ContactsBrowse, ListTag } from "@/lib/types";

const PAGE_SIZE = 25;
const STATUSES = ["active", "unsubscribed", "bounced", "complained"] as const;

interface Params {
  tab?: string;
  q?: string;
  tag?: string;
  status?: string;
  page?: string;
  email?: string;
  add?: string; // "one" | "import" → open the Add-people panel in that mode
  create?: string; // "1" → open the New-audience panel
  notice?: string; // a message bounced back from a one-click action
  notice_link?: string; // optional in-app link that resolves the notice
}

/** Build a /contacts URL, dropping empty params. */
function hubUrl(p: Partial<Params>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) usp.set(k, v);
  const s = usp.toString();
  return s ? `/contacts?${s}` : "/contacts";
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

// The one roof for people + audiences: everyone you email lives on the People
// tab (add by hand or import — no separate Import page), tags mark subsets you
// can filter by and promote to audiences, and the Audiences tab holds the named
// groups campaigns send to.
export default async function AudienceHubPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const tab = sp.tab === "audiences" ? "audiences" : "people";
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status : undefined;

  let browse: ContactsBrowse | null = null;
  let tags: ListTag[] = [];
  let lists: ContactList[] = [];
  let person: Contact | null = null;
  let personMissing = false;
  let personSuppressed: boolean | null = null;
  let failed: string | null = null;
  let isApiErr = false;

  try {
    [tags, lists] = await Promise.all([
      api.contactTags().then((r) => r.data),
      api.listLists().then((r) => r.data),
    ]);
    if (tab === "people") {
      browse = await api.browseContacts({
        q: sp.q || undefined,
        tag: sp.tag || undefined,
        status,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (sp.email) {
        personSuppressed = await api
          .checkSuppression(sp.email)
          .then((r) => r.suppressed)
          .catch(() => null);
        try {
          person = await api.getContact(sp.email);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) personMissing = true;
          else throw err;
        }
      }
    }
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else failed = "An unexpected error occurred.";
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Audience" description="Everyone you email, in one place." />
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      </>
    );
  }

  const totalPeople = browse?.total ?? 0;
  const activeFilters = Boolean(sp.q || sp.tag || status);
  const noPeopleAtAll = tab === "people" && totalPeople === 0 && !activeFilters;
  const pages = Math.max(1, Math.ceil(totalPeople / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audience"
        description="Everyone you email, in one place — add or import people, slice them by tag, and group them into the audiences your campaigns send to."
      />

      {/* Tabs: People | Audiences */}
      <Reveal>
        <div className="mb-6 flex gap-1 rounded-lg bg-secondary/50 p-1 sm:w-fit">
          {(
            [
              { id: "people", label: "People", icon: Users, count: tab === "people" ? totalPeople : null },
              { id: "audiences", label: "Audiences", icon: ListChecks, count: lists.length },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <Link
                key={t.id}
                href={hubUrl({ tab: t.id === "people" ? undefined : t.id })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-4" /> {t.label}
                {t.count !== null && t.count > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">{t.count.toLocaleString()}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </Reveal>

      {tab === "people" ? (
        <Reveal className="space-y-4" delay={0.05}>
          {/* A message bounced back from a one-click action (e.g. plan quota). */}
          {sp.notice ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <span>{sp.notice}</span>
              {sp.notice_link?.startsWith("/") ? (
                <Link href={sp.notice_link} className="font-medium underline">See plans</Link>
              ) : null}
              <Link href={hubUrl({ q: sp.q, tag: sp.tag, status })} className="ml-auto rounded p-1 text-amber-900/70 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-300" aria-label="Dismiss">
                <X className="size-4" />
              </Link>
            </div>
          ) : null}

          {/* Person detail — shown when a row (or a deep link) opens someone. */}
          {sp.email ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="min-w-0 truncate text-base">{sp.email}</CardTitle>
                <div className="flex items-center gap-2">
                  {personSuppressed !== null ? (
                    personSuppressed ? (
                      <Badge variant="destructive"><ShieldAlert /> Suppressed</Badge>
                    ) : (
                      <Badge variant="success"><ShieldCheck /> Not suppressed</Badge>
                    )
                  ) : null}
                  <Link
                    href={hubUrl({ q: sp.q, tag: sp.tag, status })}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="divide-y pt-0">
                {personMissing ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    No contact record for this email yet — it can still be suppressed. Add them with “Add people”.
                  </p>
                ) : person ? (
                  <>
                    <DetailRow label="Status"><ContactStatusBadge status={person.status} /></DetailRow>
                    <DetailRow label="Name">{person.name ?? "—"}</DetailRow>
                    <DetailRow label="Phone">{person.phone ?? "—"}</DetailRow>
                    <DetailRow label="Tags">
                      {person.tags.length ? <span className="font-mono text-xs">{person.tags.join(", ")}</span> : "—"}
                    </DetailRow>
                    <DetailRow label="Added"><LocalTime iso={person.created_at} /></DetailRow>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-muted-foreground">Subscription</span>
                      {person.status === "unsubscribed" ? (
                        <Button variant="outline" size="sm" disabled>Unsubscribed</Button>
                      ) : (
                        <form action={unsubscribeContact}>
                          <input type="hidden" name="email" value={person.email} />
                          <SubmitButton variant="outline" size="sm" pendingLabel="Working…">Unsubscribe</SubmitButton>
                        </form>
                      )}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {noPeopleAtAll ? (
            <>
              <EmptyState
                icon={<Users className="size-6" />}
                title="No one here yet"
                description="People land here when you add them, import a file, or your product signs them up through the API. Tags mark subsets — audiences are the groups you send campaigns to."
              />
              <AddPeople lists={lists.map((l) => ({ id: l.id, name: l.name }))} defaultOpen defaultMode={sp.add === "one" ? "one" : "import"} />
            </>
          ) : (
            <>
              <AddPeople
                lists={lists.map((l) => ({ id: l.id, name: l.name }))}
                defaultOpen={sp.add != null}
                defaultMode={sp.add === "import" ? "import" : "one"}
              />

              {/* Search + filters (plain GET — the URL is the state). */}
              <form action="/contacts" method="get" className="flex flex-wrap items-center gap-2">
                {sp.tag ? <input type="hidden" name="tag" value={sp.tag} /> : null}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search by email or name…" className="w-64 pl-8" />
                </div>
                <Select name="status" defaultValue={status ?? ""} className="w-40">
                  <option value="">Any status</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" size="sm">Filter</Button>
                {activeFilters ? (
                  <Link href="/contacts" className="text-sm text-muted-foreground hover:text-foreground">Clear</Link>
                ) : null}
              </form>

              {/* Subsets: the workspace's tags. Click one to see just those people. */}
              {tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Tag className="size-3.5" /> Subsets
                  </span>
                  {tags.slice(0, 12).map((t) => {
                    const active = sp.tag === t.tag;
                    return (
                      <Link
                        key={t.tag}
                        href={active ? hubUrl({ q: sp.q, status }) : hubUrl({ q: sp.q, status, tag: t.tag })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                          active ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {t.tag} <span className="tabular-nums">{t.contacts.toLocaleString()}</span>
                        {active ? <X className="size-3" /> : null}
                      </Link>
                    );
                  })}
                  {sp.tag ? (
                    <form action={audienceFromTagAction}>
                      <input type="hidden" name="tag" value={sp.tag} />
                      <SubmitButton size="sm" variant="outline" pendingLabel="Creating…" className="ml-1 h-7 text-xs">
                        <Sparkles className="size-3.5" /> Turn “{sp.tag}” into an audience
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {/* The people themselves. */}
              {browse && browse.data.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead className="text-right">Added</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {browse.data.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              {/* Straight into their CRM profile — the relationship, not a peek. */}
                              <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                                {c.email}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{c.name ?? "—"}</TableCell>
                            <TableCell><ContactStatusBadge status={c.status} /></TableCell>
                            <TableCell>
                              {c.tags.length ? (
                                <span className="flex flex-wrap gap-1">
                                  {c.tags.map((t) => (
                                    <Badge key={t} variant="secondary" className="font-mono text-[10px]">{t}</Badge>
                                  ))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                              {relativeTime(c.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState
                  icon={<Search className="size-6" />}
                  title="Nobody matches"
                  description="Try a different search, another status, or clear the tag filter."
                />
              )}

              {/* Paging. */}
              {pages > 1 ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, totalPeople).toLocaleString()} of {totalPeople.toLocaleString()}
                  </span>
                  <span className="flex gap-1">
                    {page > 1 ? (
                      <Link href={hubUrl({ q: sp.q, tag: sp.tag, status, page: String(page - 1) })} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-accent">
                        <ChevronLeft className="size-3.5" /> Prev
                      </Link>
                    ) : null}
                    {page < pages ? (
                      <Link href={hubUrl({ q: sp.q, tag: sp.tag, status, page: String(page + 1) })} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-accent">
                        Next <ChevronRight className="size-3.5" />
                      </Link>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </Reveal>
      ) : (
        <Reveal className="space-y-4" delay={0.05}>
          {lists.length === 0 ? (
            <>
              <EmptyState
                icon={<ListChecks className="size-6" />}
                title="No audiences yet"
                description="An audience is a named group of your people — “Newsletter subscribers”, “Customers” — and it's what a campaign sends to. Start one empty, or from everyone carrying a tag."
              />
              <NewAudience tags={tags} defaultOpen />
            </>
          ) : (
            <>
              <NewAudience tags={tags} defaultOpen={sp.create === "1"} />
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>People</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lists.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <Link href={`/lists/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                            {l.description ? <span className="ml-2 text-xs text-muted-foreground">{l.description}</span> : null}
                          </TableCell>
                          <TableCell className="tabular-nums">{l.contacts.toLocaleString()}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{relativeTime(l.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <form action={deleteList} className="inline">
                              <input type="hidden" name="id" value={l.id} />
                              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${l.name}`}>
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
              <p className="text-xs text-muted-foreground">
                A person can be in several audiences — marketing plans are sized by total memberships across them.
              </p>
            </>
          )}
        </Reveal>
      )}
    </>
  );
}
