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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === "plans" ? "plans" : "usage";

  let billing: Billing | null = null;
  let invoices: Invoice[] = [];
  let failed: string | null = null;
  let isApiErr = false;
  try {
    billing = await api.getBilling();
    invoices = await api.getInvoices().then((r) => r.data).catch(() => []);
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

  const { usage, summary, wings } = billing;
  const txBlocks = wings?.transactional.blocks ?? 0;
  const addonQty: Record<string, number> = {};
  for (const a of summary.add_ons) addonQty[a.id] = a.quantity;
  // Standalone add-ons = the full catalog (any add-on is buyable without a wing).
  const allAddons = billing.addons_catalog;

  const txPct = Math.round((usage.used / Math.max(1, usage.quota)) * 100);
  const ctPct = usage.contacts_limit > 0 ? Math.round((usage.contacts_used / usage.contacts_limit) * 100) : 4;
  const mkPct = usage.marketing_allowance > 0 ? Math.round((usage.marketing_sent / usage.marketing_allowance) * 100) : 0;
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

      {/* The two wing meters + AI credits — every metered thing, side by side. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <Zap className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Transactional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{num(usage.used)} / {num(usage.quota)}</span>
              <span className="text-xs text-muted-foreground">sends</span>
            </div>
            <Meter pct={txPct} tone={usage.over_limit ? "bg-destructive" : txPct > 80 ? "bg-amber-500" : "bg-primary"} />
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
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {num(usage.contacts_used)}{usage.contacts_limit === -1 ? "" : ` / ${num(usage.contacts_limit)}`}
              </span>
              <span className="text-xs text-muted-foreground">contacts</span>
            </div>
            <Meter pct={ctPct} tone={usage.contacts_limit !== -1 && usage.contacts_used >= usage.contacts_limit ? "bg-destructive" : ctPct > 80 ? "bg-amber-500" : "bg-primary"} />
            <p className="text-xs text-muted-foreground">
              {num(usage.marketing_sent)}/{num(usage.marketing_allowance)} emails this month · {mkPct}% used
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
            <Link href="/billing/platform" className="inline-flex items-center text-xs font-medium text-primary hover:underline">
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
          <Link href="/billing?tab=plans" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
            Manage <ArrowRight className="ml-0.5 size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {summary.add_ons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No add-ons yet. Seats, roles, SSO, proof exports, AI credits and more are available under Compare
              plans → Add-ons.
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
                        {new Date(inv.created * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
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
      <ComparePlans addonCatalog={allAddons} addonQty={addonQty} />

      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-semibold">Every account includes</p>
        <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Full REST API & Node SDK",
            "Append-only audit trail",
            "Automatic suppression handling",
            "Webhooks & delivery events",
            "Sandbox (test-mode) keys — always free",
            "The AI assistant across both wings",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
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
