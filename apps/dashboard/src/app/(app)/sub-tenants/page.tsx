import Link from "next/link";
import { ArrowRight, KeyRound, Network, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { SubTenantStatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";

const DESC =
  "Give each client or brand their own verified sending domain, with DKIM and email reputation kept separate. (Sending from your own address instead? Set that under Settings → Sending.)";

// The three stages of /sub-tenants/new, shown here as a preview of the journey.
// They used to be a static explainer with the create form opening UNDERNEATH
// them — describing a process the page didn't actually walk you through. Now
// they're what the flow does, and the button starts it.
const STEPS = [
  { icon: Network, title: "Add the client's domain", body: "Name the client and enter the domain they'll send from, e.g. news.acme.com." },
  { icon: KeyRound, title: "Publish the DNS records", body: "We generate DKIM + SPF records; the client (or you) adds them at their DNS host — we show exactly what to paste." },
  { icon: ShieldCheck, title: "Verify & send", body: "Once the records resolve, the domain goes verified and mail sends under it — with its reputation isolated from everyone else's." },
];

export default async function SubTenantsPage() {
  let tenants: SubTenant[] | null = null;
  let failed: string | null = null;
  let errStatus: number | undefined;
  let locked: FeatureLockedInfo | null = null;
  try {
    tenants = (await api.listSubTenants()).data;
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      errStatus = err instanceof ApiError ? err.status : undefined;
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
        <ConnectionErrorCard message={failed} status={errStatus} />
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
            <Link href="/sub-tenants/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" /> Add client domain
            </Link>
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
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/sub-tenants/new" className={cn(buttonVariants({ size: "lg" }))}>
              Set up your first client domain <ArrowRight className="size-4" />
            </Link>
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
