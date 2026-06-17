import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrgsPage() {
  const { data } = await adminApi.listOrgs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-sm text-muted-foreground">{data.length} total · newest first.</p>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Emails (period)</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/orgs/${o.id}`} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{o.slug}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={o.plan === "free" ? "muted" : "default"}>{o.plan}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.members}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(o.usage_this_period)}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
