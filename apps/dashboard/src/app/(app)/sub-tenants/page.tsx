import Link from "next/link";
import { AlertTriangle, ArrowRight, Eye, KeyRound, Network, PauseCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { ActionForm } from "@/components/app/action-form";
import { actAsClientForm } from "@/components/app/client-scope-actions";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { ReputationBadge, SubTenantStatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { REPUTATION_VISUAL, needsAttention, readDrift } from "@/lib/reputation";
import { getClientScopeId } from "@/lib/client-scope";
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
  { icon: ShieldCheck, title: "Verify & send", body: "Once the records resolve, the domain goes verified and mail sends under it — with its reputation scored separately from everyone else's." },
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
          <FeatureLocked info={locked} blurb="Client domains let your customers send under their own verified domains, each with its own DKIM keys and its own reputation score." />
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
  // Clients the sweep has acted on or flagged. Worst first — an operator opening
  // this page after a bad night should read the pause before the warning, and
  // should not have to scan a table of green rows to find either.
  // Two independent ways to be in trouble: the numbers (reputation) and the
  // records (DNS drift). Both belong here — an operator scanning this page wants
  // "what needs me", not "what needs me, by subsystem".
  const RANK = { paused: 0, throttled: 1, warn: 2, ok: 3 } as const;
  const trouble = list
    .filter((t) => needsAttention(t.reputation.state) || Boolean(readDrift(t)))
    // A stopped client outranks a warned one whatever stopped it.
    .sort((a, b) => {
      const rank = (t: typeof a) => {
        const d = readDrift(t);
        if (d?.stopped) return 0;
        if (t.reputation.state === "paused") return 0;
        if (d) return 1;
        return RANK[t.reputation.state];
      };
      return rank(a) - rank(b);
    });
  const anyPaused = trouble.some(
    (t) => t.reputation.state === "paused" || readDrift(t)?.stopped === true,
  );
  // Which client (if any) the operator is currently acting as, so the row they're
  // already inside says so instead of offering to switch them there again.
  const activeClientId = await getClientScopeId();

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
            description="Perfect for agencies and platforms: let each client send under their own domain, verified, with their bounces and complaints scored separately so you can see which client is going wrong."
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
        <Reveal className="space-y-4">
          {/* The whole point of scoring clients separately is naming WHICH one is
              going wrong. Making the operator find that by reading a column is
              most of the way back to not having it — so it leads the page, and
              only when there is something to say. */}
          {trouble.length ? (
            <div
              className={cn(
                "rounded-xl border p-4",
                anyPaused
                  ? "border-red-300 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20"
                  : "border-amber-300 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                {anyPaused ? (
                  <PauseCircle className="size-4 text-red-600 dark:text-red-400" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                )}
                {trouble.length} client{trouble.length === 1 ? "" : "s"} need
                {trouble.length === 1 ? "s" : ""} your attention
              </p>
              <ul className="mt-2.5 space-y-2">
                {trouble.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <Link href={`/sub-tenants/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{t.sending_domain}</span>
                    {needsAttention(t.reputation.state) ? (
                      <ReputationBadge state={t.reputation.state} />
                    ) : null}
                    <span className="w-full text-xs text-muted-foreground sm:w-auto">
                      {readDrift(t)?.effect ??
                        t.reputation.reason ??
                        REPUTATION_VISUAL[t.reputation.state].effect}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
                    {/* Two axes, two columns. One "Status" column could only ever
                        show one of them, and it showed the DNS one — so a client
                        the sweep had automatically paused still read "verified". */}
                    <TableHead>Verification</TableHead>
                    <TableHead>Sending</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((t) => {
                    const acting = t.id === activeClientId;
                    return (
                      <TableRow
                        key={t.id}
                        className={cn(
                          acting && "bg-primary/[0.04]",
                          t.reputation.state === "paused" && "bg-red-50/60 dark:bg-red-950/20",
                        )}
                      >
                        <TableCell className="font-mono text-sm">
                          <Link href={`/sub-tenants/${t.id}`} className="hover:underline">{t.sending_domain}</Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{t.name}</TableCell>
                        <TableCell><SubTenantStatusBadge status={t.status} /></TableCell>
                        <TableCell>
                          {needsAttention(t.reputation.state) ? (
                            // Straight to the numbers that explain it — the badge
                            // alone answers "what", never "why".
                            <Link href={`/sub-tenants/${t.id}`} className="hover:underline">
                              <ReputationBadge state={t.reputation.state} />
                            </Link>
                          ) : (
                            <ReputationBadge state={t.reputation.state} />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{relativeTime(t.created_at)}</TableCell>
                        <TableCell className="text-right">
                          {/* Registering a domain was as far as this page went — you
                              could verify a client and then never actually WORK as
                              them without calling the API by hand. This is the door
                              into their mail, audience and numbers. */}
                          {acting ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <Eye className="size-3.5" /> Viewing now
                            </span>
                          ) : (
                            <ActionForm action={actAsClientForm} errorClassName="justify-end">
                              <input type="hidden" name="id" value={t.id} />
                              <button
                                type="submit"
                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent"
                              >
                                <Eye className="size-3.5" /> View as client
                              </button>
                            </ActionForm>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Reveal>
      )}
    </>
  );
}
