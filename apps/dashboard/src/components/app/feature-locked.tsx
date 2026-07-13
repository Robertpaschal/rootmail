import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The actionable payload carried by a 402 `feature_locked` API error. */
export interface FeatureLockedInfo {
  feature?: string;
  current_plan?: string;
  required_plan?: string | null;
  required_plan_name?: string | null;
  /** Which wing the unlocking tier belongs to (per-wing pricing). */
  required_wing?: string | null;
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

// The marquee extras that ride along with each wing tier — context for the price.
const TIER_EXTRAS: Record<string, string> = {
  tx_blocks: "Send blocks also bring client sending domains and volume rates that drop as you grow.",
  mk_growth: "Marketing Growth also brings sequences, the shared replies inbox, and 10,000 contacts.",
  mk_pro: "Marketing Pro also brings 50,000 contacts and more AI assistant credits.",
  pf_team: "Platform Team also brings 10 seats, 5 workspaces, and custom roles.",
};

// Tier prices are whole monthly USD — the tier's real price, shown to market the
// whole wing tier, never a confusing per-feature micro-fee.
function fmtUsd(dollars: number | null | undefined): string | null {
  return dollars == null ? null : `$${dollars.toLocaleString()}`;
}

const WING_LABEL: Record<string, string> = {
  transactional: "Transactional wing",
  marketing: "Marketing wing",
  platform: "Add-ons",
};

// Features unlocked by an ADD-ON (the 402's required_plan is the add-on id) —
// their CTA deep-links to that exact card on the add-ons page, not a plan ladder.
const ADDON_IDS = new Set([
  "extra_seat",
  "workspace_pack",
  "ai_credit_pack",
  "custom_roles",
  "sso_scim",
  "proof_exports",
  "data_residency",
  "dedicated_ip",
  "subtenant_pack",
]);

/** A locked section renders as a pitch: what it achieves, the capabilities that
 * deliver it, and the price of the WING TIER that unlocks it (per-wing pricing —
 * upgrading one wing never touches the other's bill). */
export function FeatureLocked({ info, blurb }: { info: FeatureLockedInfo; blurb?: string }) {
  const planName = info.required_plan_name ?? info.required_plan ?? "a higher tier";
  const pitch = info.feature ? PITCHES[info.feature] : undefined;
  const base = fmtUsd(info.price);
  const extras = info.required_plan ? TIER_EXTRAS[info.required_plan] : undefined;
  const wingLabel = info.required_wing ? WING_LABEL[info.required_wing] : null;
  // An add-on gate lands EXACTLY on its card; wing-homed ones (dedicated IP,
  // client domains) live inside their wing's purchase page.
  const isAddon = !!info.required_plan && ADDON_IDS.has(info.required_plan);
  const unlockHref =
    isAddon && (info.required_wing === "platform" || !info.required_wing)
      ? `/billing/addons?focus=${info.required_plan}`
      : `/billing/${info.required_wing ?? "transactional"}`;

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

        {/* The price — the wing tier that unlocks it. */}
        <div className="border-t bg-muted/30 p-8 md:col-span-2 md:border-l md:border-t-0">
          <p className="text-sm font-medium text-muted-foreground">
            {isAddon ? "Available as an add-on" : wingLabel ? `Included in the ${wingLabel}` : "Included in"}
          </p>
          <p className="mt-1 text-xl font-bold">{planName}</p>
          {base ? (
            <p className="mt-1">
              <span className="text-2xl font-bold">{base}</span>
              <span className="text-sm text-muted-foreground">
                /mo{info.required_plan === "tx_blocks" ? " per block" : ""}
              </span>
            </p>
          ) : null}
          {base ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {isAddon
                ? "Billed monthly on its own — an add-on never changes a wing's bill, and you can buy it with no plan at all."
                : "That unlocks this wing's whole tier — and only this wing's bill changes; the rest of your account stays as it is."}
            </p>
          ) : null}
          {extras ? <p className="mt-3 text-sm text-muted-foreground">{extras}</p> : null}
          <div className="mt-5 flex flex-col gap-2">
            {/* Straight to the exact purchase spot — comparing is the secondary path. */}
            <Link href={unlockHref} className={cn(buttonVariants({ size: "sm" }))}>
              {isAddon ? `Add ${planName}` : `Unlock with ${planName}`} <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/billing?tab=plans"
              className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              See all pricing
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
