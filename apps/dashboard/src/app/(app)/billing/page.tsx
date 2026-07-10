import Link from "next/link";
import { ArrowRight, Check, Megaphone, Tag, Zap } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddonManager } from "./addon-manager";
import { BillingTabs } from "./billing-tabs";
import { WingsPricing } from "./wings/wings-pricing";

const num = (n: number) => n.toLocaleString();

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === "plans" ? "plans" : "usage";

  let billing: Billing | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    billing = await api.getBilling();
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (failed || !billing) {
    return (
      <>
        <PageHeader title="Plan & usage" />
        <ConnectionErrorCard message={failed ?? "No billing data."} showReconnect={isApiErr} />
      </>
    );
  }

  const { usage, summary, addons_catalog, wings } = billing;
  const addonQty: Record<string, number> = {};
  for (const a of summary.add_ons) addonQty[a.id] = a.quantity;

  // Transactional — sends vs the block allowance.
  const txPct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const txBar = usage.over_limit ? "bg-destructive" : txPct > 80 ? "bg-amber-500" : "bg-primary";
  const txBlocks = wings?.transactional.blocks ?? 0;
  const txAllowanceLabel =
    txBlocks > 0
      ? `${num(txBlocks)} block${txBlocks === 1 ? "" : "s"} · ${num(usage.quota)} emails/mo`
      : `Free allowance · ${num(usage.quota)} emails/mo`;

  // Marketing — audience size vs the contact bracket (sends are informational).
  const ctUsed = usage.contacts_used;
  const ctLimit = usage.contacts_limit;
  const ctPct = ctLimit > 0 ? Math.min(100, Math.round((ctUsed / ctLimit) * 100)) : 0;
  const ctBar = ctLimit > 0 && ctUsed >= ctLimit ? "bg-destructive" : ctPct > 80 ? "bg-amber-500" : "bg-primary";

  const usageSlot = (
    <>
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-muted-foreground" /> Transactional
            </CardTitle>
            <span className="text-xs text-muted-foreground">{usage.period}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{txAllowanceLabel}</p>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {num(usage.used)} / {num(usage.quota)} emails
              </span>
              <span className="text-muted-foreground">
                {usage.over_limit
                  ? txBlocks > 0
                    ? `${num(usage.overage)} over · ~$${usage.overage_cost.toFixed(2)} overage`
                    : "Free allowance used"
                  : `${num(usage.remaining)} left`}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className={`h-full rounded-full ${txBar}`} style={{ width: `${txPct}%` }} />
            </div>
            {usage.over_limit && txBlocks === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  Free allowance reached — buy send blocks to keep sending.
                </p>
                <Link href="/billing?tab=plans" className={cn(buttonVariants({ size: "sm" }))}>
                  Buy blocks <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </div>
            ) : txPct >= 80 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">At {txPct}% of your send volume.</p>
                <Link
                  href="/billing?tab=plans"
                  className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  {txBlocks > 0 ? "Add a block" : "Buy blocks"} <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4 text-muted-foreground" /> Marketing
            </CardTitle>
            <span className="text-xs text-muted-foreground">{usage.period}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Priced by audience size — campaigns to everyone are always included.
            </p>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {num(ctUsed)} {ctLimit === -1 ? "contacts" : `/ ${num(ctLimit)} contacts`}
              </span>
              <span className="text-muted-foreground">
                {num(usage.marketing_sent)} marketing emails sent
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${ctBar}`}
                style={{ width: `${ctLimit === -1 ? 4 : ctPct}%` }}
              />
            </div>
            {ctLimit !== -1 && ctUsed >= ctLimit ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  Audience at its bracket — upgrade Marketing to grow it.
                </p>
                <Link href="/billing?tab=plans" className={cn(buttonVariants({ size: "sm" }))}>
                  See brackets <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </div>
            ) : ctLimit !== -1 && ctPct >= 80 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Audience at {ctPct}% of its bracket.
                </p>
                <Link
                  href="/billing?tab=plans"
                  className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  See brackets <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What you&apos;ll be billed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.custom ? (
              <p className="text-sm text-muted-foreground">
                Custom pricing — contact sales for your invoice.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm">
                  {summary.lines.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="text-muted-foreground">{l.label}</span>
                      <span className="font-medium">${l.amount.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <span className="font-semibold">Estimated total / mo</span>
                  <span className="font-semibold">${summary.total.toFixed(2)}</span>
                </div>
                {billing.billing_mode === "local" ? (
                  <p className="text-xs text-muted-foreground">Demo billing — no card is charged.</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seats &amp; add-ons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {summary.seats.capacity === -1
                ? `${summary.seats.used} seats in use · unlimited included.`
                : `${summary.seats.used} of ${summary.seats.capacity} seats in use (${summary.seats.included} included${summary.seats.purchased ? ` + ${summary.seats.purchased} purchased` : ""}).`}
            </p>
            <AddonManager quantities={addonQty} catalog={addons_catalog} />
          </CardContent>
        </Card>
      </div>
    </>
  );

  const plansSlot = (
    <>
      {wings ? (
        <WingsPricing wings={wings} />
      ) : (
        <p className="text-sm text-muted-foreground">Pricing isn&apos;t available right now.</p>
      )}

      <div className="mt-6 rounded-lg border bg-card p-4">
        <p className="text-xs font-semibold">Every account includes</p>
        <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Full REST API & Node SDK",
            "Append-only audit trail",
            "Automatic suppression handling",
            "Webhooks & delivery events",
            "Sandbox (test-mode) keys — always free",
            "Pay for what you use, per wing",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <Tag className="size-4 shrink-0 text-primary" />
        <span>
          Have a promo code? Enter it at checkout — your discount applies to the first invoice.
        </span>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title="Plan & usage"
        description="Transactional is billed by send volume, Marketing by audience size. Sandbox (test mode) is always free."
      />
      <BillingTabs initialTab={initialTab} usage={usageSlot} plans={plansSlot} />
    </>
  );
}
