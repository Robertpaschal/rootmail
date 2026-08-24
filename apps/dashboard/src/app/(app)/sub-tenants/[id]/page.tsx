import type { ReactNode } from "react";
import { ActionForm } from "@/components/app/action-form";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, PauseCircle, ShieldCheck, XCircle } from "lucide-react";
import { verifySubTenant } from "../actions";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { ReputationBadge, SubTenantStatusBadge } from "@/components/app/status-badge";
import { DkimRotation } from "./dkim-rotation";
import { DnsDriftPanel } from "./dns-drift-panel";
import { ReputationPanel } from "./reputation-panel";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/app/local-time";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { EmailAuthReport, ReputationReport, SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ManageSubTenant } from "./manage";

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
  // Thresholds and the transition history. Advisory like the auth audit — the
  // tenant record itself already carries the state, reason and metrics, so a
  // failure here costs the history and nothing else.
  let reputation: ReputationReport | null = null;
  try {
    [st, auth, reputation] = await Promise.all([
      api.getSubTenant(id),
      api.getSubTenantAuth(id).catch(() => null),
      api.getSubTenantReputation(id).catch(() => null),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Client domain" backHref="/sub-tenants" backLabel="Client domains" />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError
              ? err.message
              : "An unexpected error occurred."
          }
          status={err instanceof ApiError ? err.status : undefined}
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
        backLabel="Client domains"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReputationBadge state={st.reputation.state} />
            <SubTenantStatusBadge status={st.status} />
          </div>
        }
      />

      {/* One domain, one column. The DNS values here are long TXT records — they
          deserve the full width more than a rail of identifiers does. Those move
          behind a disclosure at the foot, the way the message page handles the
          same problem. */}
      <div className="space-y-6">
          <DnsDriftPanel st={st} />
          <ReputationPanel st={st} report={reputation} />
          <DkimRotation st={st} />

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">DNS records</CardTitle>
                <CardDescription>Publish these at your DNS provider, then verify.</CardDescription>
              </div>
              <ActionForm action={verifySubTenant}>
                <input type="hidden" name="id" value={st.id} />
                <SubmitButton size="sm" pendingLabel="Verifying…">
                  <ShieldCheck className="size-4" /> Verify domain
                </SubmitButton>
              </ActionForm>
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
              {/* This used to read "sending from this domain is live" on the
                  strength of DNS alone — which is exactly the contradiction that
                  let a paused client look fine. DNS is verified either way; only
                  reputation decides whether mail actually goes out. */}
              {st.status === "verified" ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Domain verified — sending from this domain is
                  live
                  {st.reputation.state === "throttled"
                    ? ", though currently metered for reputation (see above)."
                    : "."}
                </div>
              ) : st.reputation.state === "paused" ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  <PauseCircle className="size-4" /> DNS for this domain is published and valid —
                  sending is stopped for reputation, not for DNS. See Sending reputation above.
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

        {/* Rename / remove — the rest of this resource's life, which until now
            simply didn't exist (no PATCH, no DELETE). */}
        <ManageSubTenant id={st.id} name={st.name} domain={st.sending_domain} />

        {/* Identifiers and dates — the deeper layer, on request. */}
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium">
            Domain details
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <dl className="grid gap-x-8 gap-y-1 px-5 pb-4 sm:grid-cols-2">
            <DetailRow label="Sub-tenant ID">
              <span className="inline-flex items-center gap-1">
                <span className="font-mono text-xs">{st.id}</span>
                <CopyButton value={st.id} />
              </span>
            </DetailRow>
            <DetailRow label="Domain verification">
              <SubTenantStatusBadge status={st.status} />
            </DetailRow>
            <DetailRow label="Sending reputation">
              <ReputationBadge state={st.reputation.state} />
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
            <DetailRow label="Created"><LocalTime iso={st.created_at} /></DetailRow>
            {st.verified_at ? (
              <DetailRow label="Verified"><LocalTime iso={st.verified_at} /></DetailRow>
            ) : null}
            {st.last_checked_at ? (
              <DetailRow label="Last checked"><LocalTime iso={st.last_checked_at} /></DetailRow>
            ) : null}
          </dl>
        </details>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        In local mock mode (<span className="font-mono">DNS_VERIFY_MODE=mock</span>), verification
        auto-passes so you can demo the flow without a real domain.
      </p>
    </>
  );
}
