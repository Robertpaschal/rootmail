import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminApi, ApiError } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatUnix } from "@/lib/format";
import { clearSuppression } from "./actions";
import { GrantCreditForm } from "./grant-credit-form";
import { ImpersonateButton } from "./impersonate-button";

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
  const { data: suppressionList } = await adminApi.listOrgSuppressions(id, 50);
  // Billing pulls from Stripe — never let a Stripe hiccup break the whole page.
  const billing = await adminApi.getOrgBilling(id).catch(() => null);

  const stats = [
    { label: "Emails this period", value: formatNumber(org.usage_this_period) },
    { label: "Total messages", value: formatNumber(org.total_messages) },
    { label: "Workspaces", value: formatNumber(org.workspaces.length) },
    { label: "Sub-tenants", value: formatNumber(org.sub_tenants) },
  ];

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
          <Badge variant={org.plan === "free" ? "muted" : "default"}>{org.plan}</Badge>
          <Badge variant="outline">{org.plan_status}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {org.id} · {org.slug}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {messages.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/messages/${m.id}`} className="font-medium hover:underline">
                        {m.to}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {m.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(m.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {org.members.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Support</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.members.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">{m.email}</TableCell>
                    <TableCell className="text-muted-foreground">{m.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ImpersonateButton userId={m.user_id} email={m.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.workspaces.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell>
                    <Badge variant={w.environment === "live" ? "success" : "muted"}>
                      {w.environment}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{w.id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {billing ? (
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-8 text-sm">
              <div>
                <div className="text-muted-foreground">Account balance</div>
                <div className="text-lg font-semibold">
                  {billing.balance < 0
                    ? `${formatMoney(-billing.balance)} credit`
                    : billing.balance > 0
                      ? `${formatMoney(billing.balance)} due`
                      : "$0.00"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Subscription</div>
                <div className="mt-0.5">
                  {billing.subscription ? (
                    <Badge variant={billing.subscription.status === "active" ? "success" : "warning"}>
                      {billing.subscription.status}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">none</span>
                  )}
                </div>
              </div>
            </div>

            {billing.subscription && billing.subscription.items.length > 0 ? (
              <div>
                <div className="mb-1.5 text-sm font-medium">Subscription items</div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {billing.subscription.items.map((it, i) => (
                    <li key={`${it.description}-${i}`}>
                      {it.description}
                      {it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : ""}
                      {it.unit_amount != null
                        ? ` — ${formatMoney(it.unit_amount)}${it.interval ? `/${it.interval}` : ""}`
                        : " — metered"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {billing.invoices.length > 0 ? (
              <div>
                <div className="mb-2 text-sm font-medium">Recent invoices</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billing.invoices.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">
                          {v.url ? (
                            <a href={v.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {v.number ?? v.id}
                            </a>
                          ) : (
                            (v.number ?? v.id)
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.status === "paid" ? "success" : "muted"}>
                            {v.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(v.total, v.currency)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatUnix(v.created)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div className="border-t pt-4">
              <div className="mb-2 text-sm font-medium">Grant account credit</div>
              {billing.stripe_customer_id ? (
                <GrantCreditForm orgId={org.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Stripe customer yet — available once the org is on a paid plan.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Suppressions</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {suppressionList.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No suppressed recipients.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressionList.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.reason === "bounce" || s.reason === "complaint" ? "destructive" : "muted"
                        }
                      >
                        {s.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(s.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={clearSuppression}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="orgId" value={org.id} />
                        <SubmitButton variant="outline" size="sm" pendingLabel="Clearing…">
                          Clear
                        </SubmitButton>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Created">{formatDate(org.created_at)}</Row>
          <Row label="Stripe customer">
            {org.stripe_customer_id ? (
              <span className="font-mono text-xs">{org.stripe_customer_id}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
          <Row label="Postal address">
            {org.postal_address ? (
              <span className="whitespace-pre-wrap">{org.postal_address}</span>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
