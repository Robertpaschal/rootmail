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
}: {
  orgName: string;
  userName: string;
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

      {step === 3 ? <VolumePitch types={types} router={router} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — size the account: three volume questions -> a per-wing recommendation.
// Pricing is per wing (transactional = send blocks, marketing = contacts), so the
// pitch asks for the numbers that actually size each wing and hands off to the
// pricing page with them pre-filled.

const BLOCK_SIZE = 25_000;
const FREE_TX_SENDS = 3_000;

function VolumePitch({
  types,
  router,
}: {
  types: string[];
  router: ReturnType<typeof useRouter>;
}) {
  const marketingFirst = types.some((t) => ["newsletter", "ecommerce", "community"].includes(t));
  const [emails, setEmails] = useState("");
  const [contacts, setContacts] = useState("");
  const [team, setTeam] = useState("");

  const e = Number(emails) || 0;
  const c = Number(contacts) || 0;
  const t = Number(team) || 1;
  const blocks = e > FREE_TX_SENDS ? Math.max(1, Math.ceil(e / BLOCK_SIZE)) : 0;

  const summary: string[] = [];
  summary.push(
    blocks > 0
      ? `Transactional: ${blocks} block${blocks === 1 ? "" : "s"} (${(blocks * BLOCK_SIZE).toLocaleString()} emails/mo)`
      : "Transactional: Free (3,000 emails/mo to start)",
  );
  summary.push(
    c > 500
      ? `Marketing: a bracket for ${c.toLocaleString()} contacts`
      : "Marketing: Free (up to 500 contacts)",
  );
  summary.push(t > 2 ? `Platform: Team (${t} people)` : "Platform: Solo (free)");

  const handoff = () => {
    const q = new URLSearchParams();
    if (e) q.set("emails", String(e));
    if (c) q.set("contacts", String(c));
    if (t > 1) q.set("team", String(t));
    router.push(`/billing/transactional${q.size ? `?${q.toString()}` : ""}`);
  };

  return (
    <section className="mx-auto max-w-2xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Last step — size it to how you send</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          rootmail prices each side of email on its own axis, so scaling is never punished:
          transactional email by <span className="font-medium text-foreground">send volume</span> (blocks
          of 25,000), marketing by <span className="font-medium text-foreground">audience size</span> —
          a campaign to your whole audience is always included.
        </p>
      </div>

      <div className="mt-8 space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="vol-emails">
            {marketingFirst ? "Product email you send per month (receipts, resets…)" : "Emails your product sends per month"}
          </Label>
          <Input
            id="vol-emails"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="e.g. 40000"
            value={emails}
            onChange={(ev) => setEmails(ev.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            First 3,000/mo are free; past that you buy blocks of 25,000 at volume rates.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vol-contacts">Contacts you&apos;ll email (newsletters, promos)</Label>
          <Input
            id="vol-contacts"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="e.g. 5000"
            value={contacts}
            onChange={(ev) => setContacts(ev.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Marketing is priced by audience size — up to 500 contacts are free.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vol-team">People on your team</Label>
          <Input
            id="vol-team"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="e.g. 4"
            value={team}
            onChange={(ev) => setTeam(ev.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <Rocket className="size-4 text-primary" /> Based on your answers
        </p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button type="button" size="lg" className="w-full sm:w-auto" onClick={handoff}>
          Size my Transactional plan <ArrowRight className="size-4" />
        </Button>
        <button
          type="button"
          className="text-sm font-medium text-muted-foreground underline hover:text-foreground"
          onClick={() => router.push("/")}
        >
          Skip — start Free on everything
        </button>
      </div>
    </section>
  );
}
