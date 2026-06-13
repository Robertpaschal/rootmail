import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Mail, TriangleAlert } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { MessageStatusBadge, SubTenantStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Message, SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function OverviewPage() {
  let messages: Message[];
  let tenants: SubTenant[];

  try {
    const [m, s] = await Promise.all([api.listMessages({ limit: 100 }), api.listSubTenants()]);
    messages = m.data;
    tenants = s.data;
  } catch (err) {
    return (
      <>
        <PageHeader title="Overview" description="A snapshot of your most recent sending activity." />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError
              ? err.message
              : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  const delivered = messages.filter((m) => m.status === "delivered").length;
  const inFlight = messages.filter((m) => ["queued", "sending", "sent"].includes(m.status)).length;
  const problems = messages.filter((m) =>
    ["bounced", "complained", "failed"].includes(m.status),
  ).length;
  const verifiedTenants = tenants.filter((t) => t.status === "verified").length;

  const stats = [
    { label: "Recent messages", value: messages.length, hint: "last 100", icon: Mail, tone: "bg-primary/10 text-primary" },
    { label: "Delivered", value: delivered, hint: "", icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-600" },
    { label: "In flight", value: inFlight, hint: "queued · sending", icon: Clock, tone: "bg-amber-100 text-amber-600" },
    { label: "Problems", value: problems, hint: "bounced · failed", icon: TriangleAlert, tone: "bg-red-100 text-red-600" },
  ];

  const recent = messages.slice(0, 8);

  return (
    <>
      <PageHeader title="Overview" description="A snapshot of your most recent sending activity." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className={cn("grid size-8 place-items-center rounded-lg", s.tone)}>
                <s.icon className="size-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{s.value}</span>
              {s.hint ? <span className="text-xs text-muted-foreground">{s.hint}</span> : null}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent messages</CardTitle>
            <Link
              href="/messages"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No messages yet — send your first one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <MessageStatusBadge status={m.status} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/messages/${m.id}`} className="hover:underline">
                          {m.to}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">
                        {m.subject}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                        {relativeTime(m.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Sub-tenants</CardTitle>
            <Link
              href="/sub-tenants"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Manage <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{tenants.length}</span>
              <span className="text-xs text-muted-foreground">{verifiedTenants} verified</span>
            </div>
            <div className="space-y-2.5">
              {tenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sub-tenants yet.</p>
              ) : (
                tenants.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/sub-tenants/${t.id}`}
                      className="truncate font-mono text-sm hover:underline"
                    >
                      {t.sending_domain}
                    </Link>
                    <SubTenantStatusBadge status={t.status} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
