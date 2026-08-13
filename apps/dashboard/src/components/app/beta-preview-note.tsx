import { FlaskConical } from "lucide-react";

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
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
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
export function BetaQuotaNote({ dailyCap }: { dailyCap: number }) {
  return (
    <BetaPreviewNote title="How your sending is actually counted right now">
      <p>
        While you&apos;re a beta tester, none of the allowances or prices below
        apply to you. Everything is unlocked, nothing is billed, and your only
        real limit is{" "}
        <span className="font-medium text-foreground">{dailyCap} sends a day</span> — because our
        email provider hasn&apos;t yet lifted the launch cap every new sending
        account starts under, and all testers share it. It resets at midnight UTC.
      </p>
      <p className="mt-2">
        The plans and prices here are our current <em>proposal</em> for how the
        finished product should work — not a decision. If the shape of it looks
        wrong for a business like yours, that is one of the most useful things
        you can tell us. Just reply to any email we send.
      </p>
    </BetaPreviewNote>
  );
}
