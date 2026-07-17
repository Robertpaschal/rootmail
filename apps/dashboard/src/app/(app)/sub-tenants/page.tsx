import Link from "next/link";
import { KeyRound, Network, ShieldCheck, Sparkles } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { InlineReveal } from "@/components/app/reveal-panel";
import { SubTenantStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { CreateSubTenantForm } from "./create-form";

const DESC =
  "Give each client or brand their own verified sending domain, with DKIM and email reputation kept separate. (Sending from your own address instead? Set that under Settings → Sending.)";

// Plain-English "how it works" so a first-time user knows what a client domain is
// and the three steps to a live one — before facing a form.
const STEPS = [
  { icon: Network, title: "Add the client's domain", body: "Name the client and enter the domain they'll send from, e.g. news.acme.com." },
  { icon: KeyRound, title: "Publish the DNS records", body: "We generate DKIM + SPF records; the client (or you) adds them at their DNS host — we show exactly what to paste." },
  { icon: ShieldCheck, title: "Verify & send", body: "Once the records resolve, the domain goes verified and mail sends under it — with its reputation isolated from everyone else's." },
];

export default async function SubTenantsPage() {
  let tenants: SubTenant[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  let locked: FeatureLockedInfo | null = null;
  try {
    tenants = (await api.listSubTenants()).data;
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (locked) {
    return (
      <>
        <PageHeader title="Client domains" description={DESC} />
        <Reveal>
          <FeatureLocked info={locked} blurb="Client domains let your customers send under their own verified domains, with DKIM and reputation isolated from each other." />
        </Reveal>
      </>
    );
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Client domains" description={DESC} />
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      </>
    );
  }

  const list = tenants ?? [];
  const empty = list.length === 0;

  return (
    <>
      <PageHeader
        title="Client domains"
        description={DESC}
        actions={
          !empty ? (
            <InlineReveal triggerLabel="Add client domain">
              <div className="mt-4 w-full">
                <CreateSubTenantForm />
              </div>
            </InlineReveal>
          ) : undefined
        }
      />

      {empty ? (
        <Reveal className="space-y-6">
          <EmptyState
            icon={<Network className="size-6" />}
            title="No client domains yet"
            description="Perfect for agencies and platforms: let each client send under their own domain, verified and reputation-isolated so one client's bounces never touch another's."
          />
          {/* How it works — three plain steps, then the form on demand. */}
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Card key={s.title}>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><s.icon className="size-4" /></span>
                    <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <InlineReveal triggerLabel="Add your first client domain" defaultOpen>
              <div className="mt-4 w-full max-w-md">
                <CreateSubTenantForm />
              </div>
            </InlineReveal>
            <Link href="/docs/client-domains" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Sparkles className="size-3.5" /> How client domains work in the docs
            </Link>
          </div>
        </Reveal>
      ) : (
        <Reveal>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{list.length} client domain{list.length === 1 ? "" : "s"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm">
                        <Link href={`/sub-tenants/${t.id}`} className="hover:underline">{t.sending_domain}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t.name}</TableCell>
                      <TableCell><SubTenantStatusBadge status={t.status} /></TableCell>
                      <TableCell className="whitespace-nowrap text-right text-muted-foreground">{relativeTime(t.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Reveal>
      )}
    </>
  );
}
