import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/rootmail";

/**
 * "You can see this, but it isn't what governs you."
 *
 * A beta tester looking at Plans & Usage sees allowances, prices and tiers that
 * are real screens showing real numbers — and none of them apply to them. Their
 * actual limit is a flat daily cap that exists only because our email provider
 * has not lifted the launch restriction on our account yet.
 *
 * Leaving that unexplained produces two bad outcomes and no good one: a tester
 * either believes the pricing is what they are being held to (and reports a bug
 * that isn't one), or hits the daily cap and cannot reconcile it with the
 * numbers on screen (and concludes the product is broken).
 *
 * Worse, we would lose the feedback we actually want. Pricing is the part of
 * rootmail least tested by use and most improved by an outside opinion — a
 * tester who knows these numbers are a PROPOSAL will tell us they are wrong. One
 * who thinks they are settled says nothing.
 *
 * So this marks the boundary explicitly, everywhere it exists.
 */
export function BetaPreviewNote({
  children,
  title = "This is a preview — it doesn't apply to your account",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <div className="text-sm text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The specific version for anywhere quotas, plans or prices are shown.
 *
 * States the real number rather than gesturing at it — a tester who knows they
 * have 12 sends can plan a test; one told "limits are different in beta" will
 * discover the number by hitting it.
 */
export async function BetaQuotaNote({ dailyCap: _legacyDailyCap }: { dailyCap?: number }) {
  const billing = await api.getBilling().catch(() => null);
  return (
    <BetaPreviewNote title="How your sending is actually counted right now">
      <p>
        Beta access includes daily sending allowances. {billing ? (
          <span className="font-medium text-foreground">Today: {billing.usage.used_today} / {billing.usage.daily_limit === -1 ? "unlimited" : billing.usage.daily_limit} transactional sends; {billing.usage.marketing_sent_today} / {billing.usage.marketing_daily_limit === -1 ? "unlimited" : billing.usage.marketing_daily_limit} marketing sends.</span>
        ) : "Your current allowances could not be loaded."} Daily counters reset at midnight UTC.
        These are Rootmail account allowances; provider restrictions apply separately.
      </p>
      <p className="mt-2">
        On Rootmail&apos;s SES sandbox route, real recipients must confirm their inboxes before
        receiving mail. <Link href="/testing#test-inboxes" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">Check your sending access and test inboxes</Link>.
        Templates and drafts stay in your workspace as access expands.
      </p>
    </BetaPreviewNote>
  );
}
