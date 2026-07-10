import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Check, Megaphone, Tag, Users, Zap } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BillingTabs } from "./billing-tabs";

const num = (n: number) => n.toLocaleString();

type Wing = "transactional" | "marketing";

// The three wings, pitched as what they are — each links OUT to its own dedicated
// pricing page. Nothing is folded together here (two-wings doctrine).
const WING_PITCHES = [
  {
    id: "transactional",
    href: "/billing/transactional",
    icon: Zap,
    title: "Transactional",
    sizedBy: "Priced by send volume",
    desc: "Product email — receipts, resets, alerts. 3,000 free sends/mo, then blocks of 25,000 at volume rates.",
    cta: "Transactional pricing",
  },
  {
    id: "marketing",
    href: "/billing/marketing",
    icon: Megaphone,
    title: "Marketing",
    sizedBy: "Priced by contacts",
    desc: "Audience email — campaigns, sequences, replies. Pay for audience size; campaigns to everyone are always included.",
    cta: "Marketing pricing",
  },
  {
    id: "platform",
    href: "/billing/platform",
    icon: Users,
    title: "Platform",
    sizedBy: "Priced by team",
    desc: "The shared foundation — seats, workspaces, roles, SSO, and compliance, serving both wings.",
    cta: "Platform pricing",
  },
] as const;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === "plans" ? "plans" : "usage";
  // The page adapts to the wing the user is working in (set by the nav switcher).
  const wingCookie = (await cookies()).get("rm_wing")?.value;
  const activeWing: Wing = wingCookie === "marketing" ? "marketing" : "transactional";

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

  const { usage, summary, wings } = billing;
  const txBlocks = wings?.transactional.blocks ?? 0;

  // Transactional meter (shown in the transactional wing).
  const txPct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const txBar = usage.over_limit ? "bg-destructive" : txPct > 80 ? "bg-amber-500" : "bg-primary";

  // Marketing meter (shown in the marketing wing).
  const ctUsed = usage.contacts_used;
  const ctLimit = usage.contacts_limit;
  const ctPct = ctLimit > 0 ? Math.min(100, Math.round((ctUsed / ctLimit) * 100)) : 0;
  const ctBar = ctLimit > 0 && ctUsed >= ctLimit ? "bg-destructive" : ctPct > 80 ? "bg-amber-500" : "bg-primary";

  const usageSlot = (
    <>
      {/* ONLY the active wing's meter — the other wing lives on its own page. */}
      {activeWing === "transactional" ? (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-muted-foreground" /> Transactional usage
            </CardTitle>
            <span className="text-xs text-muted-foreground">{usage.period}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {txBlocks > 0
                ? `${num(txBlocks)} block${txBlocks === 1 ? "" : "s"} · ${num(usage.quota)} sends/mo`
                : `Free allowance · ${num(usage.quota)} sends/mo`}
            </p>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{num(usage.used)} / {num(usage.quota)} sends</span>
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
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                Marketing has its own meter — audience size, on its own page.
              </p>
              <Link
                href="/billing/transactional"
                className={cn(buttonVariants({ size: "sm", variant: usage.over_limit || txPct >= 80 ? "default" : "outline" }))}
              >
                {txBlocks > 0 ? "Manage blocks" : "Buy send blocks"} <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4 text-muted-foreground" /> Marketing usage
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
              <span className="text-muted-foreground">{num(usage.marketing_sent)} marketing emails sent</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className={`h-full rounded-full ${ctBar}`} style={{ width: `${ctLimit === -1 ? 4 : ctPct}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                Transactional has its own meter — send volume, on its own page.
              </p>
              <Link
                href="/billing/marketing"
                className={cn(buttonVariants({ size: "sm", variant: ctLimit !== -1 && ctPct >= 80 ? "default" : "outline" }))}
              >
                See brackets <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

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
                <p className="text-xs text-muted-foreground">
                  Each wing bills on its own subscription — change one side without touching the other.
                </p>
                {billing.billing_mode === "local" ? (
                  <p className="text-xs text-muted-foreground">Demo billing — no card is charged.</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {summary.seats.capacity === -1
                ? `${summary.seats.used} seats in use · unlimited included.`
                : `${summary.seats.used} of ${summary.seats.capacity} seats in use (${summary.seats.included} included${summary.seats.purchased ? ` + ${summary.seats.purchased} purchased` : ""}).`}
            </p>
            <Link
              href="/billing/platform"
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Seats, workspaces &amp; add-ons <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const ordered = [...WING_PITCHES].sort((a, b) =>
    a.id === activeWing ? -1 : b.id === activeWing ? 1 : 0,
  );

  const plansSlot = (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">Pricing, per wing</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Two products, one foundation — each priced by what it actually uses and billed on its
          own. Pick the side you came for; the other is there when you need it.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ordered.map((w) => {
          const primary = w.id === activeWing;
          return (
            <Card key={w.id} className={cn("flex flex-col", primary && "border-primary/40 ring-1 ring-primary/15")}>
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-secondary">
                    <w.icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-semibold">{w.title}</p>
                    <p className="text-[11px] text-muted-foreground">{w.sizedBy}</p>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{w.desc}</p>
                <Link
                  href={w.href}
                  className={cn(buttonVariants({ size: "sm", variant: primary ? "default" : "outline" }), "mt-4 w-full")}
                >
                  {w.cta} <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
        description={
          activeWing === "transactional"
            ? "Your transactional usage and bill. Marketing is priced separately, by audience."
            : "Your marketing usage and bill. Transactional is priced separately, by send volume."
        }
      />
      <BillingTabs initialTab={initialTab} usage={usageSlot} plans={plansSlot} />
    </>
  );
}
