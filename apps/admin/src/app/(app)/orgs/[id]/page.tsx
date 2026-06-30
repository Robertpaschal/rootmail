import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Inbox, Mail, Network, Square } from "lucide-react";
import { adminApi, ApiError } from "@/lib/admin-api";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { OrgTabs } from "./org-tabs";

export const metadata: Metadata = { title: "Organization" };

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let org;
  try {
    org = await adminApi.getOrg(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { data: messages } = await adminApi.listOrgMessages(id, 25);
  const { data: suppressions } = await adminApi.listOrgSuppressions(id, 50);
  // Billing pulls from Stripe — never let a Stripe hiccup break the whole page.
  const billing = await adminApi.getOrgBilling(id).catch(() => null);
  // Open leads (for the "convert from lead" picker on the custom-plan form).
  const leadResp = await adminApi.listLeads().catch(() => null);
  const openLeads = (leadResp?.data ?? [])
    .filter((l) => l.status !== "won" && l.status !== "lost")
    .map((l) => ({ id: l.id, label: l.company ? `${l.company} — ${l.name}` : l.name }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/orgs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Organizations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <Badge variant={org.plan === "free" ? "muted" : "default"} className="capitalize">
            {org.plan}
          </Badge>
          <Badge variant="outline">{org.plan_status}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {org.id} · {org.slug}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Emails this period" value={formatNumber(org.usage_this_period)} icon={Mail} tone="violet" />
        <StatCard label="Total messages" value={formatNumber(org.total_messages)} icon={Inbox} tone="blue" />
        <StatCard label="Workspaces" value={formatNumber(org.workspaces.length)} icon={Square} tone="slate" />
        <StatCard label="Sub-tenants" value={formatNumber(org.sub_tenants)} icon={Network} tone="green" />
      </div>

      <OrgTabs org={org} messages={messages} suppressions={suppressions} billing={billing} openLeads={openLeads} />
    </div>
  );
}
