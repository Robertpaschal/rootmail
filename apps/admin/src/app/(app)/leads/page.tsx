import type { Metadata } from "next";
import Link from "next/link";
import { Contact, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { adminApi } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { LEAD_STATUS_LABEL, leadStatusVariant } from "@/lib/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leads" };

function isStatus(v: string | undefined): v is LeadStatus {
  return !!v && (LEAD_STATUSES as string[]).includes(v);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: raw } = await searchParams;
  const active = isStatus(raw) ? raw : undefined;
  const { data, counts } = await adminApi.listLeads(active);
  const c = (s: LeadStatus) => counts[s] ?? 0;
  const total = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
  const pipeline = c("contacted") + c("qualified") + c("proposal");

  const tabs: { key: LeadStatus | "all"; label: string; count: number; href: string }[] = [
    { key: "all", label: "All", count: total, href: "/leads" },
    ...LEAD_STATUSES.map((s) => ({
      key: s,
      label: LEAD_STATUS_LABEL[s],
      count: counts[s] ?? 0,
      href: `/leads?status=${s}`,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Enterprise & custom-plan enquiries from the contact form."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={formatNumber(total)} icon={Contact} />
        <StatCard
          label="New"
          value={formatNumber(c("new"))}
          sub="need triage"
          icon={Sparkles}
          accent={c("new") > 0}
        />
        <StatCard label="In pipeline" value={formatNumber(pipeline)} icon={TrendingUp} />
        <StatCard label="Won" value={formatNumber(c("won"))} icon={Trophy} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const isActive = (t.key === "all" && !active) || t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  isActive ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        {data.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No leads here yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company / Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                      {l.company || l.name}
                    </Link>
                    {l.company ? <div className="text-xs text-muted-foreground">{l.name}</div> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.email}</TableCell>
                  <TableCell>
                    <Badge variant={leadStatusVariant(l.status)}>{LEAD_STATUS_LABEL[l.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.owner_email ?? <span className="text-muted-foreground/60">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(l.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
