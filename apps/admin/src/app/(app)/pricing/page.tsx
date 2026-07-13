import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { AddonEditor } from "./addon-editor";
import { CustomPlansCard } from "./custom-plans-card";
import { PlanEditor } from "./plan-editor";
import { RevenueSummary } from "./revenue-summary";
import { TierEditor } from "./tier-editor";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const [{ data: plans }, { data: tiers }, { data: addons }, { data: customPlans }, billing, analytics] =
    await Promise.all([
      adminApi.listPlans(),
      adminApi.listPricingTiers().catch(() => ({ data: [] })),
      adminApi.listAddons(),
      adminApi.listCustomPlans(),
      adminApi.getBillingStatus().catch(() => null),
      adminApi.analytics().catch(() => null),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Your pricing control center — review every plan, add-on, sale, and custom sub at a glance,
          then edit any one inline. Changes apply immediately; the billed Stripe price syncs
          automatically, so you rarely need the Stripe dashboard. Superadmin only.
        </p>
      </div>

      {analytics ? <RevenueSummary analytics={analytics} /> : null}

      {/* Stripe / billing status */}
      {billing ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">Billing:</span>
              {billing.mode === "stripe" ? (
                <Badge variant={billing.live ? "success" : "secondary"}>
                  Stripe · {billing.live ? "LIVE" : "test"}
                </Badge>
              ) : (
                <Badge variant="muted">local (no Stripe key)</Badge>
              )}
            </span>
            <span className="text-muted-foreground">
              Embedded checkout: {billing.publishable_set ? "ready" : "no publishable key"}
            </span>
            <span className="text-muted-foreground">
              Metered overage — Pro {billing.overage_meters.pro ? "✓" : "—"} · Scale{" "}
              {billing.overage_meters.scale ? "✓" : "—"}
            </span>
            <Link href="/promotions" className="ml-auto font-medium hover:underline">
              Promotions &amp; coupons →
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* THE pricing model — per-wing tiers (tx blocks / mk contact-size). */}
      <Card>
        <CardHeader>
          <CardTitle>Wing pricing — the live model</CardTitle>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pricing tiers in the database — run the pricing seed, then{" "}
              <code className="rounded bg-muted px-1 py-0.5">sync-wing-prices</code>.
            </p>
          ) : (
            <TierEditor tiers={tiers} />
          )}
        </CardContent>
      </Card>

      {/* Legacy plans (pre-wing resolver fallback — rarely edited now). */}
      <div className="space-y-4">
        {plans.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No plans in the database yet. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5">pnpm db:seed:pricing</code> to populate
              the catalog from the defaults, then refresh. (Customer-facing pricing still works off
              the built-in defaults.)
            </CardContent>
          </Card>
        ) : null}
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="capitalize">{p.name}</span>
                <Badge variant={p.active ? "success" : "muted"}>
                  {p.active ? "active" : "inactive"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlanEditor plan={p} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add-ons */}
      <Card>
        <CardHeader>
          <CardTitle>Add-ons</CardTitle>
        </CardHeader>
        <CardContent className="py-0">
          {addons.map((a) => (
            <AddonEditor key={a.id} addon={a} />
          ))}
        </CardContent>
      </Card>

      {/* Custom plans (bespoke subs) */}
      <Card>
        <CardHeader>
          <CardTitle>Custom plans · {customPlans.filter((c) => c.active).length} active</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomPlansCard plans={customPlans} />
        </CardContent>
      </Card>
    </div>
  );
}
