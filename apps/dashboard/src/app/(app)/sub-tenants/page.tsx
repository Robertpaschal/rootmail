import Link from "next/link";
import { AlertTriangle, ArrowRight, Eye, KeyRound, Network, PauseCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { ActionForm } from "@/components/app/action-form";
import { ClientLine } from "@/components/app/client-line";
import { actAsClientForm } from "@/components/app/client-scope-actions";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { ReputationBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
            title="See which client is going wrong before it costs the others"
            description="Give every client their own sending domain, verified and signed under their own name, with their bounces and complaints scored separately. They share our IP pool — so when one client&apos;s list goes bad, we throttle that client and the rest keep flowing."
          />
          {/* How it works — three plain steps, then the form on demand. */}
          {/* A real sequence — you cannot verify records that have not been
              published — so it is drawn as one line with three stops, not as
              three boxes that happen to be numbered. */}
          <ol className="relative ml-3 border-l border-rule pl-7">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative pb-7 last:pb-0">
                <span
                  aria-hidden
                  className="absolute -left-[2.15rem] top-0 grid size-7 place-items-center rounded-full border border-rule bg-background shadow-knockout"
                >
                  <s.icon className="size-3.5 text-ink-muted" />
                </span>
                <p className="flex items-baseline gap-2 text-sm font-medium">
                  <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
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
                "rounded-lg border p-4",
                anyPaused
                  ? "border-stopped bg-stopped-tint"
                  : "border-acted bg-acted-tint",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                {anyPaused ? (
                  <PauseCircle className="size-4 text-stopped" />
                ) : (
                  <AlertTriangle className="size-4 text-acted" />
                )}
                {trouble.length} client{trouble.length === 1 ? "" : "s"} need
                {trouble.length === 1 ? "s" : ""} your attention
              </p>
              <ul className="mt-2.5 space-y-2">
                {trouble.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    {/* The picture IS the disclosure: the trunk is shared, and
                        you can see we pinch one branch so the others keep
                        flowing. See docs/design/00-PHILOSOPHY.md §3.4. */}
                    <ClientLine tenant={t} />
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

          {/* ONE TRUNK, MANY BRANCHES.
              Seven columns of badges is a spreadsheet of a thing that is
              actually a picture: every client hangs off one shared pool, and
              the product's whole claim is that we can pinch one branch without
              touching the others. `ClientLine` at page scale already draws
              exactly that — shared pool → their domain → what their mail is
              doing — so each client is that drawing with its name on it, and
              the two axes that used to be columns (DNS, reputation) are the
              stations of their own line. */}
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/20 pb-2">
              <h2 className="text-sm font-medium uppercase tracking-wide">
                {list.length} client domain{list.length === 1 ? "" : "s"}
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                one provider account · one IP pool · {list.length} separately-scored sender
                {list.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul>
              {list.map((t) => {
                const acting = t.id === activeClientId;
                const stopped = t.reputation.state === "paused" || readDrift(t)?.stopped === true;
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "-mx-3 border-b border-rule px-3 py-4",
                      acting && "bg-primary/[0.04]",
                      stopped && "bg-stopped-tint",
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link
                        href={`/sub-tenants/${t.id}`}
                        className="font-medium tracking-heading hover:underline"
                      >
                        {t.name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground" data-fact>
                        {t.sending_domain}
                      </span>
                      {needsAttention(t.reputation.state) ? (
                        <Link href={`/sub-tenants/${t.id}`}>
                          <ReputationBadge state={t.reputation.state} />
                        </Link>
                      ) : null}
                      <span className="ml-auto flex shrink-0 items-center gap-3">
                        <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                          added {relativeTime(t.created_at)}
                        </span>
                        {acting ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Eye className="size-3.5" /> Viewing now
                          </span>
                        ) : (
                          <ActionForm action={actAsClientForm} errorClassName="justify-end">
                            <input type="hidden" name="id" value={t.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-interaction ease-interaction hover:bg-accent"
                            >
                              <Eye className="size-3.5" /> View as client
                            </button>
                          </ActionForm>
                        )}
                      </span>
                    </div>

                    <div className="mt-3 overflow-x-auto pb-1">
                      <ClientLine tenant={t} scale="page" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </Reveal>
      )}
    </>
  );
}
