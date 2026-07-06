"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  HeartHandshake,
  Loader2,
  Newspaper,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "./actions";

// ---------------------------------------------------------------------------
// Step data

const BUSINESS_TYPES = [
  { id: "ecommerce", label: "E-commerce & retail", desc: "Receipts, shipping updates, promotions", icon: ShoppingBag },
  { id: "saas", label: "SaaS or app", desc: "Transactional email from your product via API", icon: AppWindow },
  { id: "agency", label: "Agency — I send for clients", desc: "Each client gets their own sending domain", icon: Briefcase },
  { id: "newsletter", label: "Newsletter & media", desc: "Editions, digests, and subscriber growth", icon: Newspaper },
  { id: "community", label: "Community & nonprofit", desc: "Member updates, events, and appeals", icon: HeartHandshake },
  { id: "other", label: "Something else", desc: "Tell us in a word or two", icon: Sparkles },
] as const;

const PROVIDERS = [
  { id: "sendgrid", label: "SendGrid" },
  { id: "mailgun", label: "Mailgun" },
  { id: "postmark", label: "Postmark" },
  { id: "mailchimp", label: "Mailchimp" },
  { id: "smtp", label: "In-house / SMTP" },
  { id: "none", label: "Just starting out" },
] as const;

// A curated list keeps the select fast; "Other" accepts free text downstream.
const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Netherlands", "Spain", "Italy", "Ireland", "Sweden", "Norway", "Denmark",
  "Switzerland", "Austria", "Belgium", "Portugal", "Poland", "Nigeria", "Ghana",
  "Kenya", "South Africa", "Egypt", "India", "Singapore", "Japan", "Brazil",
  "Mexico", "Argentina", "United Arab Emirates", "Other",
];

// Map browser locale region → country name, so the select starts smart.
const REGION_TO_COUNTRY: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", NL: "Netherlands", ES: "Spain", IT: "Italy",
  IE: "Ireland", SE: "Sweden", NO: "Norway", DK: "Denmark", CH: "Switzerland",
  AT: "Austria", BE: "Belgium", PT: "Portugal", PL: "Poland", NG: "Nigeria",
  GH: "Ghana", KE: "Kenya", ZA: "South Africa", EG: "Egypt", IN: "India",
  SG: "Singapore", JP: "Japan", BR: "Brazil", MX: "Mexico", AR: "Argentina",
  AE: "United Arab Emirates",
};

// ---------------------------------------------------------------------------

export function OnboardingWizard({
  orgName,
  userName,
  plans,
}: {
  orgName: string;
  userName: string;
  plans: Plan[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1 — business identity + compliance address
  const [businessName, setBusinessName] = useState(orgName);
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  // Step 2 — what describes them (multi-select + other)
  const [types, setTypes] = useState<string[]>([]);
  const [otherType, setOtherType] = useState("");

  // Step 3 — how they send today
  const [provider, setProvider] = useState<string | null>(null);

  // Smart prefill: country from the browser locale.
  useEffect(() => {
    if (country) return;
    const region = navigator.language.split("-")[1]?.toUpperCase();
    if (region && REGION_TO_COUNTRY[region]) setCountry(REGION_TO_COUNTRY[region]);
  }, [country]);

  const step1Valid = businessName.trim() && addressLine.trim() && city.trim() && country;

  const toggleType = (id: string) =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  // Entering the pitch saves the profile + completes onboarding — so every exit
  // from step 4 (checkout, free, even closing the tab) leaves the account sane.
  const finishProfile = () =>
    start(async () => {
      setError(null);
      const res = await completeOnboarding({
        business_name: businessName.trim(),
        address_line: addressLine.trim(),
        city: city.trim(),
        state: state.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        country,
        business_types: types.includes("other") && otherType.trim()
          ? [...types.filter((t) => t !== "other"), `other:${otherType.trim()}`]
          : types,
        previous_provider: provider,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setStep(3);
      window.scrollTo({ top: 0 });
    });

  const steps = ["Your business", "What you do", "How you send", "Pick your plan"];

  return (
    <div>
      {/* Progress */}
      <div className="mx-auto mb-10 flex max-w-2xl items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-secondary")} />
            <span className={cn("text-[11px]", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {step === 0 ? (
        <section className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            {userName ? `Welcome, ${userName.split(" ")[0]} 👋` : "Welcome 👋"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            First, the business behind your email. We ask because anti-spam law (CAN-SPAM and
            equivalents) requires a real postal address on commercial email — we add it to your
            marketing footers automatically, so you&apos;re compliant from day one.
          </p>

          <div className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Business or organization name</Label>
              <Input id="ob-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-addr">Street address</Label>
              <Input
                id="ob-addr"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Street, P.O. box, or registered agent address"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-city">City</Label>
                <Input id="ob-city" value={city} onChange={(e) => setCity(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-state">State / region</Label>
                <Input id="ob-state" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-zip">Postal / ZIP code</Label>
                <Input id="ob-zip" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-country">Country</Label>
              <select
                id="ob-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Select your country
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Shown only in the footer of marketing and sales emails — never sold, never shared.
              Transactional mail is exempt.
            </p>
          </div>

          <div className="mt-8 flex justify-end">
            <Button type="button" disabled={!step1Valid} onClick={() => setStep(1)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">What best describes {businessName || "you"}?</h1>
          <p className="mt-2 text-muted-foreground">
            Pick all that apply — this shapes which parts of rootmail we put front and center for
            you. Nothing is locked away either way.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {BUSINESS_TYPES.map((t) => {
              const active = types.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg",
                      active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                    )}
                  >
                    <t.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      {t.label}
                      {active ? <Check className="size-4 text-primary" /> : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{t.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {types.includes("other") ? (
            <Input
              value={otherType}
              onChange={(e) => setOtherType(e.target.value)}
              placeholder="What do you do?"
              className="mt-3"
            />
          ) : null}

          <div className="mt-8 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button type="button" disabled={types.length === 0} onClick={() => setStep(2)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">How do you send email today?</h1>
          <p className="mt-2 text-muted-foreground">
            If you&apos;re moving from another provider, we&apos;ll import your contacts and
            suppression list from their export — your sender reputation moves with you.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {PROVIDERS.map((p) => {
              const active = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left font-medium transition-colors",
                    active ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40",
                  )}
                >
                  <span className="flex items-center justify-between">
                    {p.label}
                    {active ? <Check className="size-4 text-primary" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          <div className="mt-8 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button type="button" disabled={!provider || pending} onClick={finishProfile}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? <PlanPitch plans={plans} types={types} router={router} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — the personalized pitch: sticky plan cards over scrollable rows.

function recommend(types: string[]): { id: string; reason: string } {
  if (types.includes("agency")) {
    return {
      id: "scale",
      reason:
        "Agencies live on Scale: every client gets their own verified sending domain with isolated reputation (sub-tenants), plus roles for your team.",
    };
  }
  if (types.includes("saas") && types.length > 1) {
    return {
      id: "scale",
      reason:
        "You're sending product email AND reaching audiences — Scale covers both, with sub-tenants and role-based access as you grow.",
    };
  }
  if (types.some((t) => ["newsletter", "ecommerce", "community"].includes(t))) {
    return {
      id: "pro",
      reason:
        "Campaigns, drip sequences, and a shared inbox for replies — Pro is built for reaching an audience like yours.",
    };
  }
  return {
    id: "pro",
    reason: "Free is a real start — and Pro unlocks campaigns, sequences, and replies when you're ready.",
  };
}

function fmtPrice(cents: number | null): string {
  if (cents == null) return "Custom";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtQuota(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString()}k` : String(n);
}

function PlanPitch({
  plans,
  types,
  router,
}: {
  plans: Plan[];
  types: string[];
  router: ReturnType<typeof useRouter>;
}) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const rec = useMemo(() => recommend(types), [types]);
  const ordered = plans;

  const rows: { label: string; value: (p: Plan) => string | boolean }[] = [
    { label: "Emails / month", value: (p) => fmtQuota(p.monthly_quota) },
    { label: "Team seats", value: (p) => (p.seats === -1 ? "Unlimited" : String(p.seats)) },
    { label: "Live workspaces", value: (p) => (p.workspace_limit === -1 ? "Unlimited" : String(p.workspace_limit)) },
    { label: "Client sending domains", value: (p) => (p.included_sub_tenants > 0 ? String(p.included_sub_tenants) : false) },
    { label: "AI assistant credits", value: (p) => (p.ai_credits > 0 ? String(p.ai_credits) : false) },
    { label: "Campaigns & sequences", value: (p) => p.features.includes("campaigns") },
    { label: "Replies & shared inbox", value: (p) => p.features.includes("threads") },
    { label: "Custom roles (RBAC)", value: (p) => p.features.includes("rbac") },
    { label: "Signed proof & compliance exports", value: (p) => p.features.includes("proof") },
    { label: "SAML SSO + SCIM", value: (p) => p.features.includes("sso") },
  ];

  const price = (p: Plan) => {
    const base = interval === "year" ? p.price_yearly : p.price;
    const sale = interval === "year" ? p.sale_price_yearly : p.sale_price;
    return { base, sale };
  };

  const choose = (p: Plan) => {
    if (p.price == null) router.push("/contact?topic=sales");
    else if (p.id === "free") router.push("/");
    else router.push(`/billing/checkout?plan=${p.id}&interval=${interval}`);
  };

  return (
    <section>
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight">One last thing — pick where to start</h1>
        <p className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <Rocket className="mr-1.5 inline size-4 text-primary" />
          {rec.reason}
        </p>
        <div className="mt-4 inline-flex rounded-lg border p-0.5 text-sm">
          {(["month", "year"] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={cn(
                "rounded-md px-3.5 py-1.5 font-medium capitalize transition-colors",
                interval === iv ? "bg-secondary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {iv === "year" ? "Yearly — 2 months free" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky plan cards; the feature rows scroll beneath them. */}
      <div className="sticky top-0 z-10 mt-8 grid grid-cols-2 gap-2 border-b bg-background/95 py-3 backdrop-blur md:grid-cols-4 md:gap-3">
        {ordered.map((p) => {
          const { base, sale } = price(p);
          const recommended = p.id === rec.id;
          return (
            <div
              key={p.id}
              className={cn(
                "rounded-xl border p-3 md:p-4",
                recommended ? "border-primary shadow-sm" : "border-border",
              )}
            >
              {recommended ? (
                <span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Recommended
                </span>
              ) : null}
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1">
                {sale != null ? (
                  <>
                    <span className="text-xl font-bold">{fmtPrice(sale)}</span>
                    <span className="ml-1.5 text-sm text-muted-foreground line-through">{fmtPrice(base)}</span>
                  </>
                ) : (
                  <span className="text-xl font-bold">{fmtPrice(base)}</span>
                )}
                {p.price != null ? (
                  <span className="text-xs text-muted-foreground">/{interval === "year" ? "yr" : "mo"}</span>
                ) : null}
              </p>
              {p.sale_percent_off ? (
                <p className="text-[11px] font-medium text-emerald-600">{p.sale_percent_off}% off right now</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={recommended ? "default" : "outline"}
                className="mt-2 w-full"
                onClick={() => choose(p)}
              >
                {p.price == null ? "Talk to us" : p.id === "free" ? "Continue on Free" : `Start with ${p.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Feature rows — what each tier actually achieves. */}
      <div className="divide-y">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-2 items-center gap-2 py-3 md:grid-cols-4 md:gap-3">
            <p className="col-span-2 pt-1 text-sm font-medium md:col-span-4">{row.label}</p>
            {ordered.map((p) => {
              const v = row.value(p);
              return (
                <div key={p.id} className="text-sm text-muted-foreground">
                  {v === true ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : v === false ? (
                    <span className="text-muted-foreground/40">—</span>
                  ) : (
                    <span className="font-medium text-foreground">{v}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Every plan includes the send API, templates, contacts, suppression safety, and the test
        sandbox. You can change plans any time —{" "}
        <button type="button" className="font-medium text-foreground underline" onClick={() => router.push("/")}>
          continue on Free for now
        </button>
        .
      </p>
    </section>
  );
}
