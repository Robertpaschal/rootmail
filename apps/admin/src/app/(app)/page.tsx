import { adminApi } from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

export default async function OverviewPage() {
  const { data } = await adminApi.listOrgs();
  const totalOrgs = data.length;
  const paidOrgs = data.filter((o) => o.plan !== "free").length;
  const totalMembers = data.reduce((a, o) => a + o.members, 0);
  const totalUsage = data.reduce((a, o) => a + o.usage_this_period, 0);

  const stats = [
    { label: "Organizations", value: totalOrgs },
    { label: "Paid orgs", value: paidOrgs },
    { label: "Members", value: totalMembers },
    { label: "Emails this period", value: totalUsage },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide snapshot across all organizations.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">{formatNumber(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
