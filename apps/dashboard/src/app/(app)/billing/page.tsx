import Link from "next/link";
import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Megaphone,
  Package,
  Receipt,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { LocalTime } from "@/components/app/local-time";
import { InfoHint } from "@/components/app/info-hint";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing, Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BillingTabs } from "./billing-tabs";
import { ComparePlans } from "./compare-plans";

const num = (n: number) => n.toLocaleString();
const money = (n: number) => `$${n.toFixed(2)}`;

function Meter({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; wing?: string }>;
}) {
  const { tab, wing } = await searchParams;
  const initialTab = tab === "plans" ? "plans" : "usage";
  const initialSegment =
    wing === "marketing" || wing === "addons" || wing === "transactional" ? wing : undefined;

  let billing: Billing | null = null;
  let invoices: Invoice[] = [];
  let failed: string | null = null;
  let errStatus: number | undefined;
  try {
    billing = await api.getBilling();
    invoices = await api.getInvoices().then((r) => r.data).catch(() => []);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      errStatus = err instanceof ApiError ? err.status : undefined;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (failed || !billing) {
    return (
      <>
        <PageHeader title="Plan & usage" />
        <ConnectionErrorCard message={failed ?? "No billing data."} status={errStatus} />
      </>
    );
  }

  const { usage, summary, wings } = billing;
  const txBlocks = wings?.transactional.blocks ?? 0;
  const addonQty: Record<string, number> = {};
  for (const a of summary.add_ons) addonQty[a.id] = a.quantity;
  // Standalone add-ons = the full catalog (any add-on is buyable without a wing).
  const allAddons = billing.addons_catalog;

  const txPct = Math.round((usage.used / Math.max(1, usage.quota)) * 100);
  // An older API may not send the daily fields yet — hide that meter, don't crash.
  const txDaily = usage.daily_limit ?? -1;
  const txDailyPct = txDaily > 0 ? Math.round(((usage.used_today ?? 0) / txDaily) * 100) : 0;
  const mkPct = usage.marketing_allowance > 0 ? Math.round((usage.marketing_sent / usage.marketing_allowance) * 100) : 0;
  const mkDailyPct =
    usage.marketing_daily_limit > 0
      ? Math.round((usage.marketing_sent_today / usage.marketing_daily_limit) * 100)
      : 0;
  const aiPct = usage.ai_credits > 0 ? Math.round((usage.ai_used / usage.ai_credits) * 100) : 0;

  // ---- The financial dashboard (tab 1) — everything the user is billed, explicit.
  const usageSlot = (
    <div className="space-y-6">
      {/* Headline: this month's estimated bill. */}
      <Card className="border-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estimated this month
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {summary.custom ? "Custom" : money(summary.total)}
              {!summary.custom ? <span className="text-base font-normal text-muted-foreground">/mo</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {billing.billing_mode === "local" ? "Demo billing — no card is charged." : "Billed per wing + add-ons, each on its own."}
            </p>
          </div>
          <Link href="/billing?tab=plans" className={cn(buttonVariants({ variant: "outline" }))}>
            Change plan <ArrowRight className="ml-1 size-4" />
          </Link>
        </CardContent>
      </Card>

      {/* The two wing meters + AI credits — every metered thing, side by side.
          Each carries its own definition behind an (i), so the meaning is one
          hover away from the number it explains. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <Zap className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Transactional</CardTitle>
            <InfoHint label="What counts as a transactional send">
              <span className="font-medium text-foreground">Transactional sends</span> are one-to-one emails a
              person can&apos;t unsubscribe from — receipts, password resets, alerts, and your personal replies
              in a conversation. It doesn&apos;t matter where the send comes from: your app via the API, the
              SDK, the CLI, or writing one here. Metered against your monthly send blocks, with a per-day
              burst cap.
            </InfoHint>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{num(usage.used)} / {num(usage.quota)}</span>
              <span className="text-xs text-muted-foreground">sends this month</span>
            </div>
            <Meter pct={txPct} tone={usage.over_limit ? "bg-destructive" : txPct > 80 ? "bg-amber-500" : "bg-primary"} />
            {txDaily > 0 ? (
              <>
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Today</span>
                  <span>
                    {num(usage.used_today ?? 0)} / {num(txDaily)} daily cap
                  </span>
                </div>
                <Meter
                  pct={txDailyPct}
                  tone={
                    (usage.used_today ?? 0) >= txDaily
                      ? "bg-destructive"
                      : txDailyPct > 80
                        ? "bg-amber-500"
                        : "bg-primary/60"
                  }
                />
              </>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {txBlocks > 0 ? `${num(txBlocks)} block${txBlocks === 1 ? "" : "s"}` : "Free allowance"}
              {usage.over_limit && txBlocks > 0 ? ` · ${num(usage.overage)} over (~${money(usage.overage_cost)})` : ""}
            </p>
            <Link href="/billing/transactional" className="inline-flex items-center text-xs font-medium text-primary hover:underline">
              Manage <ArrowRight className="ml-0.5 size-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <Megaphone className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Marketing</CardTitle>
            <InfoHint label="What counts as a marketing send">
              <span className="font-medium text-foreground">Marketing sends</span> are bulk mail to an audience
              — campaigns, sequences, promos — always carrying an unsubscribe. They draw on their own monthly
              allowance <span className="font-medium text-foreground">and</span> a daily cap, both scaled by
              your contact size. Never mixed with transactional: if a campaign turns into a one-on-one
              conversation, those replies count as transactional.
            </InfoHint>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* The MARKETING SEND meters lead — monthly allowance, then the daily
                cap. Contacts are the pricing base, stated underneath. */}
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {num(usage.marketing_sent)} / {num(usage.marketing_allowance)}
              </span>
              <span className="text-xs text-muted-foreground">sends this month</span>
            </div>
            <Meter
              pct={mkPct}
              tone={
                usage.marketing_allowance > 0 && usage.marketing_sent >= usage.marketing_allowance
                  ? "bg-destructive"
                  : mkPct > 80
                    ? "bg-amber-500"
                    : "bg-primary"
              }
            />
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Today</span>
              <span>
                {num(usage.marketing_sent_today)} / {num(usage.marketing_daily_limit)} daily cap
              </span>
            </div>
            <Meter
              pct={mkDailyPct}
              tone={
                usage.marketing_daily_limit > 0 && usage.marketing_sent_today >= usage.marketing_daily_limit
                  ? "bg-destructive"
                  : mkDailyPct > 80
                    ? "bg-amber-500"
                    : "bg-primary/60"
              }
            />
            <p className="text-xs text-muted-foreground">
              Priced by audience size — {num(usage.contacts_used)}
              {usage.contacts_limit === -1 ? "" : ` of ${num(usage.contacts_limit)}`} contacts. Both caps grow
              with it.
            </p>
            <Link href="/billing/marketing" className="inline-flex items-center text-xs font-medium text-primary hover:underline">
              Manage <ArrowRight className="ml-0.5 size-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <Sparkles className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">AI credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {num(usage.ai_used)} / {usage.ai_credits === -1 ? "∞" : num(usage.ai_credits)}
              </span>
              <span className="text-xs text-muted-foreground">this month</span>
            </div>
            <Meter pct={usage.ai_credits === -1 ? 4 : aiPct} tone={aiPct > 80 ? "bg-amber-500" : "bg-primary"} />
            <p className="text-xs text-muted-foreground">Shared across both wings — top up with AI credit packs.</p>
            <Link href="/billing/addons?focus=ai_credit_pack" className="inline-flex items-center text-xs font-medium text-primary hover:underline">
              Add credits <ArrowRight className="ml-0.5 size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Your add-ons — what you already have, with volumes. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-4 text-muted-foreground" /> Your add-ons
          </CardTitle>
          <Link href="/billing/addons" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
            Manage <ArrowRight className="ml-0.5 size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {summary.add_ons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No add-ons yet. Seats, roles, SSO, proof exports, AI credits and more live on the{" "}
              <Link href="/billing/addons" className="font-medium text-primary hover:underline">
                Add-ons page
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {summary.add_ons.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">
                    {a.name}
                    {a.quantity > 1 ? <span className="ml-1 font-medium text-foreground">×{a.quantity}</span> : null}
                  </span>
                  <span className="font-medium tabular-nums">{money(a.amount)}/mo</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Itemized bill — exactly what makes up the total. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you&apos;re billed</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.custom ? (
            <p className="text-sm text-muted-foreground">Custom pricing — contact sales for your invoice.</p>
          ) : (
            <>
              <ul className="divide-y text-sm">
                {summary.lines.map((l, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="font-medium tabular-nums">{money(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t pt-3">
                <span className="font-semibold">Estimated total / mo</span>
                <span className="text-lg font-bold tabular-nums">{money(summary.total)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Past invoices — downloadable. The financial-record part. */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Receipt className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Invoices & receipts</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices yet. Once you&apos;re on a paid wing or add-on, every invoice appears here — downloadable as PDF.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Invoice</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2 text-muted-foreground">
                        <LocalTime iso={new Date(inv.created * 1000).toISOString()} mode="date" />
                      </td>
                      <td className="py-2 font-medium">{inv.number ?? inv.id.slice(0, 12)}</td>
                      <td className="py-2 text-right tabular-nums">{money(inv.amount_paid || inv.amount_due)}</td>
                      <td className="py-2 text-right">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            inv.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : inv.status === "open"
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {inv.status ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          {inv.invoice_pdf ? (
                            <a href={inv.invoice_pdf} className="inline-flex items-center text-primary hover:underline" title="Download PDF">
                              <Download className="size-4" />
                            </a>
                          ) : null}
                          {inv.hosted_invoice_url ? (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-muted-foreground hover:text-foreground" title="View invoice">
                              <ExternalLink className="size-4" />
                            </a>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ---- Compare plans (tab 2) — centered pill + add-ons everywhere.
  const plansSlot = (
    <div className="space-y-10">
      <ComparePlans
        addonCatalog={allAddons}
        addonQty={addonQty}
        initialSegment={initialSegment}
        wings={billing.wings ?? null}
      />

      {/* What every account can DO — in the order a person cares about it.
          This block used to open with "Full REST API & Node SDK", which reads
          as though the product is a library you integrate. It isn't: you can
          run the whole thing without writing a line. The API is real and it's
          free on every plan — it just isn't the headline, so it sits at the
          foot, pointed at the docs, for the people who want it. */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-semibold">On every plan, free ones included</p>
        <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Write and send without touching code",
            "Design emails visually and save them as templates",
            "Every reply lands in your inbox — both wings",
            "See what happened to each email, and why",
            "Rehearse a real send before it goes out",
            "An AI assistant that builds, sends and explains",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Rather wire it up yourself? The REST API, official SDKs, webhooks and a free test sandbox are on
          every plan too —{" "}
          <Link href="/docs" className="font-medium text-primary hover:underline">
            read the developer docs
          </Link>
          .
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <Tag className="size-4 shrink-0 text-primary" />
        <span>Have a promo code? Enter it at checkout — your discount applies to the first invoice.</span>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Plan & usage"
        description="Your billing dashboard — what you use, what you pay, and every invoice, all in one place."
      />
      <BillingTabs initialTab={initialTab} usage={usageSlot} plans={plansSlot} />
    </>
  );
}
