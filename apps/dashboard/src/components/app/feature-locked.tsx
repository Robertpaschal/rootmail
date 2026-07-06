import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The actionable payload carried by a 402 `feature_locked` API error. */
export interface FeatureLockedInfo {
  feature?: string;
  current_plan?: string;
  required_plan?: string | null;
  required_plan_name?: string | null;
  price?: number | null;
}

/** Extract feature-locked details from an unknown caught error's `details`. */
export function asFeatureLocked(details: unknown): FeatureLockedInfo {
  return (details ?? {}) as FeatureLockedInfo;
}

// What each gated section ACHIEVES — the pitch, not the lock. "If users don't
// know what they're missing, they won't upgrade."
const PITCHES: Record<string, { headline: string; capabilities: string[] }> = {
  campaigns: {
    headline: "Send one message to your whole audience — and see exactly how it lands.",
    capabilities: [
      "Pick a list + a template, send or schedule in one step",
      "Suppressed and unsubscribed contacts are skipped automatically",
      "A per-campaign funnel: sent → delivered → opened → clicked",
    ],
  },
  sequences: {
    headline: "Welcome, onboard, and follow up automatically — set it up once.",
    capabilities: [
      "Multi-step drips with waits between sends",
      "Stops automatically the moment someone replies",
      "Per-step drop-off shows where people lose interest",
    ],
  },
  threads: {
    headline: "When people reply, the conversation lands here — not in a void.",
    capabilities: [
      "Replies parsed and threaded into a shared inbox",
      "Answer in-app or route replies to your systems via webhook",
      "Sequences exit automatically on reply",
    ],
  },
  subtenants: {
    headline: "Give every client their own sending domain — isolated reputation, zero shared risk.",
    capabilities: [
      "Per-client DKIM keys and DNS verification, managed for you",
      "One client's mistakes never touch another's deliverability",
      "The same API you already use, scoped per tenant",
    ],
  },
  rbac: {
    headline: "Give teammates exactly the access they need — nothing more.",
    capabilities: [
      "Custom roles remixing the full permission catalog",
      "Scope who can send, edit content, or touch billing",
      "Every change lands in the append-only audit trail",
    ],
  },
  proof: {
    headline: "Prove exactly what you sent — signed, timestamped, verifiable by anyone.",
    capabilities: [
      "Ed25519-signed compliance exports over any date range",
      "Tamper-evident: any edit breaks the signature",
      "Data-retention policies: redact or delete on your schedule",
    ],
  },
  sso: {
    headline: "Your team signs in through your identity provider — joiners and leavers handled.",
    capabilities: [
      "SAML 2.0 with Okta, Microsoft Entra ID, or Google Workspace",
      "New teammates provisioned automatically on first login",
      "SCIM deprovisioning revokes access the moment IT removes someone",
    ],
  },
};

// The marquee extras that ride along with each tier — context for the price.
const TIER_EXTRAS: Record<string, string> = {
  pro: "Also in Pro: campaigns, sequences, the shared inbox, and 10× the send quota.",
  scale: "Also in Scale: client sending domains, custom roles, and more seats + workspaces.",
  enterprise: "Also in Enterprise: signed compliance exports, SAML SSO + SCIM, and custom volume.",
};

function fmtCents(cents: number | null | undefined): string | null {
  return cents == null ? null : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** A locked section renders as a pitch: what it achieves, the capabilities that
 * deliver it, and the live (sale-aware) price of the plan that unlocks it. */
export async function FeatureLocked({ info, blurb }: { info: FeatureLockedInfo; blurb?: string }) {
  const planName = info.required_plan_name ?? info.required_plan ?? "a higher plan";
  const pitch = info.feature ? PITCHES[info.feature] : undefined;

  // Live catalog price for the required tier — best-effort, never blocks the page.
  let plan: Plan | null = null;
  if (info.required_plan) {
    const billing = await api.getBilling().catch(() => null);
    plan = billing?.plans.find((p) => p.id === info.required_plan) ?? null;
  }
  const base = fmtCents(plan?.price);
  const sale = fmtCents(plan?.sale_price);
  const extras = info.required_plan ? TIER_EXTRAS[info.required_plan] : undefined;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-5">
        {/* The value — what this section achieves for them. */}
        <div className="p-8 md:col-span-3">
          <div className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Lock className="size-5" />
          </div>
          <h3 className="text-lg font-semibold leading-snug">
            {pitch?.headline ?? `Unlock this section with ${planName}.`}
          </h3>
          {blurb ? <p className="mt-2 text-sm text-muted-foreground">{blurb}</p> : null}
          {pitch ? (
            <ul className="mt-4 space-y-2">
              {pitch.capabilities.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* The price — live, sale-aware, with what else the tier brings. */}
        <div className="border-t bg-muted/30 p-8 md:col-span-2 md:border-l md:border-t-0">
          <p className="text-sm font-medium text-muted-foreground">Included in</p>
          <p className="mt-1 text-xl font-bold">{planName}</p>
          {base ? (
            <p className="mt-1">
              {sale && sale !== base ? (
                <>
                  <span className="text-2xl font-bold">{sale}</span>
                  <span className="ml-2 text-sm text-muted-foreground line-through">{base}</span>
                </>
              ) : (
                <span className="text-2xl font-bold">{base}</span>
              )}
              <span className="text-sm text-muted-foreground">/mo</span>
              {plan?.sale_percent_off ? (
                <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  {plan.sale_percent_off}% off
                </span>
              ) : null}
            </p>
          ) : null}
          {extras ? <p className="mt-3 text-sm text-muted-foreground">{extras}</p> : null}
          <div className="mt-5 flex flex-col gap-2">
            {/* Straight to the money page — comparing is the secondary path. */}
            <Link
              href={
                plan && plan.price != null
                  ? `/billing/checkout?plan=${plan.id}&interval=month`
                  : "/billing?tab=plans"
              }
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Unlock with {planName} <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/billing?tab=plans"
              className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Compare all plans
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
