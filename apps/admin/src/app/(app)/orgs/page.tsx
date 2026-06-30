import type { Metadata } from "next";
import { Building2, CreditCard, Mail, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { adminApi } from "@/lib/admin-api";
import { formatNumber } from "@/lib/format";
import { OrgsTable } from "./orgs-table";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrgsPage() {
  const { data } = await adminApi.listOrgs();
  const paid = data.filter((o) => o.plan !== "free").length;
  const members = data.reduce((a, o) => a + o.members, 0);
  const usage = data.reduce((a, o) => a + o.usage_this_period, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" description="Every account on the platform." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={formatNumber(data.length)} icon={Building2} tone="blue" />
        <StatCard
          label="Paid"
          value={formatNumber(paid)}
          sub={data.length ? `${Math.round((paid / data.length) * 100)}% of all` : undefined}
          icon={CreditCard}
          tone="green"
        />
        <StatCard label="Members" value={formatNumber(members)} icon={Users} tone="slate" />
        <StatCard label="Emails / period" value={formatNumber(usage)} icon={Mail} tone="violet" />
      </div>

      <OrgsTable orgs={data} />
    </div>
  );
}
