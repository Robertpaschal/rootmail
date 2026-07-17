import Link from "next/link";
import { ArrowRight, Building2, Contact, CreditCard, LifeBuoy, Mail, Server, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/admin-api";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Lead, OrgSummary, ProvisioningQueue, SupportTicketListItem } from "@/lib/types";

// The wing-era customer mix — what orgs actually hold, not a retired plan ladder.
const MIX_ROWS: { key: "free" | "transactional" | "marketing" | "both_wings" | "custom"; label: string; color: string }[] = [
  { key: "free", label: "Free", color: "bg-slate-400" },
  { key: "transactional", label: "Transactional", color: "bg-violet-500" },
  { key: "marketing", label: "Marketing", color: "bg-blue-500" },
  { key: "both_wings", label: "Both wings", color: "bg-emerald-500" },
  { key: "custom", label: "Custom", color: "bg-amber-500" },
];

export default async function OverviewPage() {
  const [orgsRes, analytics, ticketsRes, leadsRes, provisioning] = await Promise.all([
    adminApi.listOrgs().catch(() => ({ data: [] as OrgSummary[] })),
    adminApi.analytics().catch(() => null),
    adminApi.listSupportTickets("open").catch(() => ({ data: [] as SupportTicketListItem[] })),
    adminApi.listLeads("new").catch(() => ({ data: [] as Lead[] })),
    adminApi.provisioningQueue().catch(() => ({ dedicated_ip: [] } as unknown as ProvisioningQueue)),
  ]);
  const orgs = orgsRes.data;
  const openTickets = ticketsRes.data;
  const newLeads = leadsRes.data;
  const ipQueue = provisioning.dedicated_ip ?? [];

  const paid = analytics?.orgs.paid ?? 0;
  // Wing MRR + add-ons — computed by the API from what each org actually holds.
  const mrr = analytics?.revenue.total_recurring ?? 0;
  const members = orgs.reduce((a, o) => a + o.members, 0);
  const usage = orgs.reduce((a, o) => a + o.usage_this_period, 0);
  const mix = analytics?.orgs.mix ?? { free: 0, transactional: 0, marketing: 0, both_wings: 0, custom: 0 };
  const recentOrgs = [...orgs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide snapshot across every organization."
        actions={
          <Link
            href="/orgs"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            All organizations <ArrowRight className="size-4" />
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Organizations" value={formatNumber(orgs.length)} sub={`${paid} paid`} icon={Building2} href="/orgs" tone="blue" />
        <StatCard label="Est. MRR" value={formatMoney(mrr * 100)} sub="wings + add-ons" icon={CreditCard} href="/pricing" tone="green" />
        <StatCard label="Emails / period" value={formatNumber(usage)} icon={Mail} tone="violet" />
        <StatCard label="Members" value={formatNumber(members)} icon={Users} tone="slate" />
        <StatCard label="Open tickets" value={formatNumber(openTickets.length)} icon={LifeBuoy} href="/support" tone="amber" accent={openTickets.length > 0} />
        <StatCard label="New leads" value={formatNumber(newLeads.length)} icon={Contact} href="/leads" tone="rose" accent={newLeads.length > 0} />
      </div>

      {/* Fulfillment: purchases that wait on staff to set up (dedicated IPs). Only
          shows when there's something to do — click through to activate it. */}
      {ipQueue.length > 0 ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold">Awaiting dedicated-IP provisioning</h2>
            <Badge variant="warning">{ipQueue.length}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            These orgs bought a Dedicated IP. Assign the real SES IP on the org page, then flip it to active.
          </p>
          <ul className="mt-3 divide-y">
            {ipQueue.map((q) => (
              <li key={q.org_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/orgs/${q.org_id}`} className="min-w-0 truncate font-medium hover:underline">
                  {q.org_name}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">requested {formatDate(q.since)}</span>
                  <Link href={`/orgs/${q.org_id}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">
                    Provision <ArrowRight className="size-3" />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Customer mix</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">By what each org holds — wings, both, or a custom sub.</p>
          <div className="mt-3 space-y-2.5">
            {MIX_ROWS.map(({ key, label, color }) => {
              const count = mix[key] ?? 0;
              const total = Object.values(mix).reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((count / total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent organizations</h2>
            <Link href="/orgs" className="text-xs text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          <ul className="mt-2 divide-y">
            {recentOrgs.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">No organizations yet — they&apos;ll appear here as people sign up.</li>
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
                    <span className="text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Open support</h2>
            <Link href="/support" className="text-xs text-muted-foreground hover:text-foreground">
              Inbox →
            </Link>
          </div>
          <ul className="mt-2 divide-y">
            {openTickets.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">All caught up — no open tickets.</li>
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
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(t.last_message_at)}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">New leads</h2>
            <Link href="/leads" className="text-xs text-muted-foreground hover:text-foreground">
              Pipeline →
            </Link>
          </div>
          <ul className="mt-2 divide-y">
            {newLeads.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">No new leads to triage right now.</li>
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
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(l.created_at)}</span>
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
