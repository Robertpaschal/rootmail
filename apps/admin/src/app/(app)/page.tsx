import Link from "next/link";
import { ArrowRight, Building2, Contact, CreditCard, Globe, LifeBuoy, Mail, Server, Users } from "lucide-react";
import { Line, type Station } from "@rootmail/design";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/admin-api";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Lead, OrgSummary, ProvisioningQueue, SupportTicketListItem } from "@/lib/types";

// The wing-era customer mix — what orgs actually hold, not a retired plan ladder.
//
// These rows used to be five saturated bars: violet, blue, emerald, amber. A
// wing is not a state — nothing here was witnessed, acted on or stopped — so
// under §9.7 it gets told apart by its label, which was already sitting right
// next to it doing that job. The bars are ink; the colour budget is spent
// elsewhere, on the two sections below that report what we have and have not
// done for a paying customer.
const MIX_ROWS: { key: "free" | "transactional" | "marketing" | "both_wings" | "custom"; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "transactional", label: "Transactional" },
  { key: "marketing", label: "Marketing" },
  { key: "both_wings", label: "Both wings" },
  { key: "custom", label: "Custom" },
];

export default async function OverviewPage() {
  const [orgsRes, analytics, ticketsRes, leadsRes, provisioning] = await Promise.all([
    adminApi.listOrgs().catch(() => ({ data: [] as OrgSummary[] })),
    adminApi.analytics().catch(() => null),
    adminApi.listSupportTickets("open").catch(() => ({ data: [] as SupportTicketListItem[] })),
    adminApi.listLeads("new").catch(() => ({ data: [] as Lead[] })),
    adminApi.provisioningQueue().catch(() => ({ dedicated_ip: [], reply_domain: [] } as unknown as ProvisioningQueue)),
  ]);
  const orgs = orgsRes.data;
  const openTickets = ticketsRes.data;
  const newLeads = leadsRes.data;
  const ipQueue = provisioning.dedicated_ip ?? [];
  const replyQueue = provisioning.reply_domain ?? [];

  const paid = analytics?.orgs.paid ?? 0;
  // Wing MRR + add-ons — computed by the API from what each org actually holds.
  const mrr = analytics?.revenue.total_recurring ?? 0;
  const members = orgs.reduce((a, o) => a + o.members, 0);
  const usage = orgs.reduce((a, o) => a + o.usage_this_period, 0);
  const mix = analytics?.orgs.mix ?? { free: 0, transactional: 0, marketing: 0, both_wings: 0, custom: 0 };
  const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0);
  const recentOrgs = [...orgs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6);
  const owed = ipQueue.length + replyQueue.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Every organization on the platform, and the things we owe them."
        actions={
          <Link
            href="/orgs"
            className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors duration-interaction ease-interaction hover:bg-accent"
          >
            All organizations <ArrowRight className="size-4" />
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="organizations" value={formatNumber(orgs.length)} window="all time" method={`orgs table · ${paid} paid`} icon={Building2} href="/orgs" />
        <StatCard label="est. recurring" value={formatMoney(mrr * 100)} window="this period" method="wings + add-ons" caveat="estimate from what each org holds" icon={CreditCard} href="/pricing" />
        <StatCard label="emails" value={formatNumber(usage)} window="this period" method="api+worker" icon={Mail} />
        <StatCard label="members" value={formatNumber(members)} window="all time" method="org memberships" icon={Users} />
        <StatCard label="open tickets" value={formatNumber(openTickets.length)} window="now" method="support inbox" icon={LifeBuoy} href="/support" />
        <StatCard label="untriaged leads" value={formatNumber(newLeads.length)} window="now" method="leads · status new" icon={Contact} href="/leads" />
      </div>

      {/* What a customer has paid for and not yet received.
       *
       * These two sections used to be washed in amber — a colour that now means
       * "we intervened", which is the opposite of what is true here: nobody has
       * intervened, that is the entire problem. So they are drawn instead, with
       * the line each purchase is stuck on. The purchase is witnessed; the steps
       * that have not happened are dotted. Staff can read how far along a
       * customer is without opening the org, and the picture cannot flatter us,
       * because a step we have not done has no way to render as done. */}
      {owed > 0 ? (
        <section className="rounded-lg border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium tracking-heading">Bought and not yet delivered</h2>
              <Badge variant="outline">{owed}</Badge>
            </div>
          </header>

          {ipQueue.length > 0 ? (
            <div className="border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Server className="size-4 text-ink-muted" aria-hidden />
                Dedicated IPs
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                These orgs bought a dedicated IP. Assign the real SES address on the org page, then
                switch it to active — the middle station stays dotted until you do.
              </p>
              <ul className="mt-3 divide-y">
                {ipQueue.map((q) => (
                  <li key={q.org_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm">
                    <Link href={`/orgs/${q.org_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {q.org_name}
                    </Link>
                    <Line stations={ipStations()} label="Purchased, then IP assigned, then active — assignment not done" />
                    <span className="font-mono text-xs text-muted-foreground">
                      waiting since {formatDate(q.since)}
                    </span>
                    <Link
                      href={`/orgs/${q.org_id}`}
                      className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-interaction ease-interaction hover:bg-accent"
                    >
                      Provision <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {replyQueue.length > 0 ? (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="size-4 text-ink-muted" aria-hidden />
                Reply domains
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                These orgs want replies on their own domain. Once their DNS resolves, create the SES
                receipt rule, then activate.
              </p>
              <ul className="mt-3 divide-y">
                {replyQueue.map((q) => (
                  <li key={q.org_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm">
                    <Link href={`/orgs/${q.org_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {q.org_name} <span className="font-mono text-xs text-muted-foreground">{q.domain}</span>
                    </Link>
                    <Line
                      stations={replyStations(q.dns_verified)}
                      label={
                        q.dns_verified
                          ? "Requested, then DNS verified — receipt rule not created"
                          : "Requested — DNS not yet resolving"
                      }
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {q.dns_verified ? "DNS verified" : "DNS not resolving"} · {formatDate(q.since)}
                    </span>
                    <Link
                      href={`/orgs/${q.org_id}`}
                      className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-interaction ease-interaction hover:bg-accent"
                    >
                      Provision <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium tracking-heading">Customer mix</h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            organizations · now · what each org holds
          </p>
          <div className="mt-3 space-y-2.5">
            {MIX_ROWS.map(({ key, label }) => {
              const count = mix[key] ?? 0;
              const pct = mixTotal ? Math.round((count / mixTotal) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden bg-muted">
                    <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-heading">Recent organizations</h2>
            <Link href="/orgs" className="text-xs text-muted-foreground transition-colors duration-interaction ease-interaction hover:text-foreground">
              View all
            </Link>
          </div>
          <ul className="mt-2 divide-y">
            {recentOrgs.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">
                An organization lands here the moment someone finishes signup, before they have sent
                anything.
              </li>
            ) : (
              recentOrgs.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/orgs/${o.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {o.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="muted" className="capitalize">
                      {o.plan}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-heading">Open support</h2>
            <Link href="/support" className="text-xs text-muted-foreground transition-colors duration-interaction ease-interaction hover:text-foreground">
              Inbox
            </Link>
          </div>
          <ul className="mt-2 divide-y">
            {openTickets.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">
                Every ticket has an answer. A new one appears here the moment a customer writes in.
              </li>
            ) : (
              openTickets.slice(0, 5).map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  <Link href={`/support/${t.id}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.subject || t.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.last_message?.body ?? t.email}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatDate(t.last_message_at)}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-heading">New leads</h2>
            <Link href="/leads" className="text-xs text-muted-foreground transition-colors duration-interaction ease-interaction hover:text-foreground">
              Pipeline
            </Link>
          </div>
          <ul className="mt-2 divide-y">
            {newLeads.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">
                Nobody is waiting on a first reply. Contact-form submissions arrive here untriaged.
              </li>
            ) : (
              newLeads.slice(0, 5).map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {l.name}
                        {l.company ? ` · ${l.company}` : ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{l.email}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatDate(l.created_at)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Purchased → IP assigned → active. Only the purchase has happened; a queued
 *  item is by definition one where the next station is still dotted. */
function ipStations(): Station[] {
  return [
    { label: "Purchased", state: "witnessed" },
    { label: "IP assigned", state: "unknown" },
    { label: "Active", state: "unknown" },
  ];
}

/** Requested → DNS resolving → receipt rule → active. DNS is the only station
 *  the customer controls, and the only one that can already be witnessed. */
function replyStations(dnsVerified: boolean): Station[] {
  return [
    { label: "Requested", state: "witnessed" },
    { label: "DNS", state: dnsVerified ? "witnessed" : "unknown" },
    { label: "Receipt rule", state: "unknown" },
    { label: "Active", state: "unknown" },
  ];
}
