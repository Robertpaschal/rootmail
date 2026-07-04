"use client";

import { useState } from "react";
import Link from "next/link";
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
import { DedicatedIpForm } from "./dedicated-ip-form";
import { formatDate, formatDateTime, formatMoney, formatUnix } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminBilling, MessageSummary, OrgDetail, Suppression } from "@/lib/types";
import { clearSuppression } from "./actions";
import { CustomPlanForm } from "./custom-plan-form";
import { GrantCreditForm } from "./grant-credit-form";
import { ImpersonateButton } from "./impersonate-button";

type TabId = "overview" | "activity" | "people" | "billing" | "suppressions";

export function OrgTabs({
  org,
  messages,
  suppressions,
  billing,
  openLeads,
}: {
  org: OrgDetail;
  messages: MessageSummary[];
  suppressions: Suppression[];
  billing: AdminBilling | null;
  openLeads: { id: string; label: string }[];
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity", badge: messages.length },
    { id: "people", label: "People", badge: org.members.length },
    { id: "billing", label: "Billing & plan" },
    { id: "suppressions", label: "Suppressions", badge: suppressions.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab org={org} /> : null}
      {tab === "activity" ? <ActivityTab messages={messages} /> : null}
      {tab === "people" ? <PeopleTab org={org} /> : null}
      {tab === "billing" ? <BillingTab org={org} billing={billing} openLeads={openLeads} /> : null}
      {tab === "suppressions" ? <SuppressionsTab orgId={org.id} suppressions={suppressions} /> : null}
    </div>
  );
}

function OverviewTab({ org }: { org: OrgDetail }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Plan">
            <span className="capitalize">{org.plan}</span> · {org.plan_status}
          </Row>
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
          <Row label="Data region">
            <span className="font-mono text-xs">{org.data_region}</span>
          </Row>
          {org.dedicated_ip_status !== "none" ? (
            <div className="pt-2">
              <DedicatedIpForm
                orgId={org.id}
                status={org.dedicated_ip_status}
                address={org.dedicated_ip_address}
              />
            </div>
          ) : null}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab({ messages }: { messages: MessageSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent messages</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {messages.length === 0 ? (
          <EmptyRow>No messages yet — this org hasn&apos;t sent anything.</EmptyRow>
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
                  <TableCell className="max-w-xs truncate text-muted-foreground">{m.subject}</TableCell>
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
  );
}

function PeopleTab({ org }: { org: OrgDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {org.members.length === 0 ? (
          <EmptyRow>No members.</EmptyRow>
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
  );
}

function BillingTab({
  org,
  billing,
  openLeads,
}: {
  org: OrgDetail;
  billing: AdminBilling | null;
  openLeads: { id: string; label: string }[];
}) {
  return (
    <div className="space-y-5">
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
          <CardTitle>Custom / enterprise plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {org.custom_plan
              ? "This org runs on a bespoke enterprise plan — edit its economics below; changes apply immediately."
              : "Create a bespoke enterprise plan for this customer: it puts them on the enterprise tier (all features unlocked) with the economics you set, and can convert an originating lead into a customer."}
          </p>
          <CustomPlanForm
            orgId={org.id}
            plan={org.custom_plan}
            openLeads={openLeads}
            hasStripeCustomer={!!org.stripe_customer_id}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SuppressionsTab({ orgId, suppressions }: { orgId: string; suppressions: Suppression[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suppressed recipients</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {suppressions.length === 0 ? (
          <EmptyRow>No suppressed recipients — a clean sending reputation.</EmptyRow>
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
              {suppressions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.email}</TableCell>
                  <TableCell>
                    <Badge variant={s.reason === "bounce" || s.reason === "complaint" ? "destructive" : "muted"}>
                      {s.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(s.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={clearSuppression}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="orgId" value={orgId} />
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

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-2 text-sm text-muted-foreground">{children}</p>;
}
