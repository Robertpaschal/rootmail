import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, XCircle } from "lucide-react";
import { verifySubTenant } from "../actions";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { SubTenantStatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { EmailAuthReport, SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";

const authVisual = {
  pass: { badge: "success", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
  weak: { badge: "warning", icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400" },
  missing: { badge: "destructive", icon: XCircle, color: "text-red-600 dark:text-red-400" },
  blocked: { badge: "secondary", icon: Info, color: "text-muted-foreground" },
} as const;

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function SubTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let st: SubTenant;
  let auth: EmailAuthReport | null = null;
  try {
    // The auth audit is advisory — never let it break the page.
    [st, auth] = await Promise.all([api.getSubTenant(id), api.getSubTenantAuth(id).catch(() => null)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Sub-tenant" backHref="/sub-tenants" backLabel="Sub-tenants" />
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

  return (
    <>
      <PageHeader
        title={st.sending_domain}
        description={st.name}
        backHref="/sub-tenants"
        backLabel="Sub-tenants"
        actions={<SubTenantStatusBadge status={st.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">DNS records</CardTitle>
                <CardDescription>Publish these at your DNS provider, then verify.</CardDescription>
              </div>
              <form action={verifySubTenant}>
                <input type="hidden" name="id" value={st.id} />
                <SubmitButton size="sm" pendingLabel="Verifying…">
                  <ShieldCheck className="size-4" /> Verify domain
                </SubmitButton>
              </form>
            </CardHeader>
            <CardContent className="space-y-3">
              {(st.dns_records ?? []).map((r) => (
                <div key={`${r.purpose}-${r.host}`} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="muted" className="uppercase">
                      {r.purpose}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{r.type}</span>
                    {r.required ? (
                      <span className="text-xs text-muted-foreground">· required</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="min-w-0 flex-1 truncate font-mono text-sm">{r.host}</code>
                    <CopyButton value={r.host} />
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {r.value}
                    </code>
                    <CopyButton value={r.value} />
                  </div>
                </div>
              ))}
              {st.status === "verified" ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Domain verified — sending from this domain is
                  live.
                </div>
              ) : null}
            </CardContent>
          </Card>

          {auth ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email authentication</CardTitle>
                <CardDescription>
                  SPF, DKIM, DMARC &amp; BIMI for {auth.domain} — {auth.summary.passing}/{auth.summary.total} passing
                  {auth.mode === "mock" ? " (mock mode)" : ""}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {auth.items.map((it) => {
                  const v = authVisual[it.status];
                  const Icon = v.icon;
                  return (
                    <div key={it.mechanism} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("size-4 shrink-0", v.color)} />
                        <span className="text-sm font-medium">{it.label}</span>
                        <Badge variant={v.badge} className="text-[10px] uppercase">
                          {it.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{it.detail}</p>
                      {it.recommendation ? <p className="mt-1 text-sm">{it.recommendation}</p> : null}
                      {it.record ? (
                        <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2">
                          <div className="flex items-center gap-1">
                            <code className="min-w-0 flex-1 truncate font-mono text-xs">{it.record.host}</code>
                            <CopyButton value={it.record.host} />
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                              {it.record.value}
                            </code>
                            <CopyButton value={it.record.value} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <DetailRow label="Sub-tenant ID">
              <span className="inline-flex items-center gap-1">
                <span className="font-mono text-xs">{st.id}</span>
                <CopyButton value={st.id} />
              </span>
            </DetailRow>
            <DetailRow label="Status">
              <SubTenantStatusBadge status={st.status} />
            </DetailRow>
            <DetailRow label="Domain">
              <span className="font-mono text-xs">{st.sending_domain}</span>
            </DetailRow>
            {st.external_id ? (
              <DetailRow label="External ID">
                <span className="font-mono text-xs">{st.external_id}</span>
              </DetailRow>
            ) : null}
            <DetailRow label="DKIM selector">
              <span className="font-mono text-xs">{st.dkim_selector}</span>
            </DetailRow>
            <DetailRow label="Inherits templates">{st.inherits_templates ? "Yes" : "No"}</DetailRow>
            <DetailRow label="Created">{formatDateTime(st.created_at)}</DetailRow>
            {st.verified_at ? (
              <DetailRow label="Verified">{formatDateTime(st.verified_at)}</DetailRow>
            ) : null}
            {st.last_checked_at ? (
              <DetailRow label="Last checked">{formatDateTime(st.last_checked_at)}</DetailRow>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        In local mock mode (<span className="font-mono">DNS_VERIFY_MODE=mock</span>), verification
        auto-passes so you can demo the flow without a real domain.
      </p>
    </>
  );
}
