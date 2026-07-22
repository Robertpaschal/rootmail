import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Check,
  FileCheck2,
  FileText,
  Gauge,
  Inbox,
  Megaphone,
  Network,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CtaButton } from "@/components/site/cta-button";
import { CodeBlock } from "@/components/site/code-block";
import { CodeShowcase } from "@/components/site/code-showcase";
import { DevFooter, DevNavbar } from "@/components/site/dev-shell";
import { Reveal } from "@/components/site/motion";

const heroSnippet = `import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

// The last email code you write for this product.
await mail.send({
  to: user.email,
  template: "welcome",            // designed & edited in the dashboard
  variables: { name: user.name },
  idempotencyKey: \`welcome-\${user.id}\`,
});`;

// Persona (a): stop hand-rolling email inside every backend you build.
const whyPoints = [
  {
    icon: RefreshCcw,
    title: "Change email without redeploying",
    body: "Templates, sequences, sender domains, suppression rules — all live in rootmail, editable by you or the people you build for. Your product's code stays untouched when the email needs change.",
  },
  {
    icon: ShieldCheck,
    title: "The boring parts, guaranteed",
    body: "Idempotent sends, automatic suppression and bounce handling, DKIM/SPF/DMARC, signed webhooks, and an append-only audit trail. You inherit a decade of email lessons in one integration.",
  },
  {
    icon: Users,
    title: "Hand the keys to non-developers",
    body: "Everything you wire up is drivable from a no-code dashboard. Build for a client, hand them the dashboard, keep the API — both of you work on the same data.",
  },
  {
    icon: Network,
    title: "Grows into platform territory",
    body: "Sending on behalf of YOUR customers? Client domains give each their own verified identity and isolated reputation — no re-platforming the day you become a platform.",
  },
];

// Entry-point agnosticism, stated as an API surface: the dashboard is one client.
const surface = [
  { icon: Send, name: "Send", note: "idempotent, templated, sandboxed" },
  { icon: FileText, name: "Templates & blocks", note: "the studio's output, versioned" },
  { icon: Users, name: "Contacts & audiences", note: "import, segment, suppress" },
  { icon: Megaphone, name: "Campaigns", note: "send, schedule, funnel stats" },
  { icon: RefreshCcw, name: "Sequences", note: "multi-step, stop-on-reply" },
  { icon: Inbox, name: "Replies", note: "threaded inbound, webhook-routed" },
  { icon: Webhook, name: "Webhooks", note: "signed, idempotent, replayable" },
  { icon: Gauge, name: "Deliverability", note: "score, fixes, DNS records" },
  { icon: BarChart3, name: "Analytics", note: "per campaign, sequence, tenant" },
  { icon: Network, name: "Client domains", note: "per-customer DKIM + verify" },
  { icon: FileCheck2, name: "Proof exports", note: "Ed25519-signed, tamper-evident" },
  { icon: Sparkles, name: "Assistant", note: "build, operate & diagnose via API" },
];

const guarantees = [
  "snake_case JSON over HTTPS — Bearer auth, no surprises",
  "Idempotency keys on every send — retries never double-send",
  "Test-mode keys & a hosted test inbox — sandbox sends are always free",
  "Signed webhooks with delivery logs you can replay",
  "Append-only audit trail on every message",
  "One-command migration: SendGrid, Postmark, Mailgun exports",
];

export default function DevelopersHome() {
  return (
    <>
      <DevNavbar />
      <main>
        {/* HERO — the developer promise, code first. */}
        <section className="relative overflow-hidden">
          <div
            className="absolute left-1/2 top-[-10%] -z-10 h-[420px] w-[720px] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]"
            aria-hidden="true"
          />
          <div className="container grid items-center gap-10 py-20 md:py-28 lg:grid-cols-2">
            <Reveal className="flex flex-col gap-6">
              <Badge variant="muted" className="w-fit py-1">
                <Terminal className="size-3" /> rootmail for developers
              </Badge>
              <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
                Stop rebuilding email{" "}
                <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
                  inside every product.
                </span>
              </h1>
              <p className="max-w-xl text-balance text-lg text-muted-foreground">
                You&apos;ve written the in-house email service before — for your product, or a
                client&apos;s. Outsource that layer once: rootmail carries sending, templates,
                audiences, deliverability, and proof, so email keeps up with the market without
                you redeploying anything.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <CtaButton label="Get an API key" size="lg" arrow />
                <Link
                  href="/docs"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  <BookOpen className="size-4" /> Read the docs
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                Typed Node SDK · CLI · REST — and everything stays editable from the dashboard by
                anyone you hand it to.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <CodeBlock code={heroSnippet} filename="the-last-email-code.ts" className="text-left" />
            </Reveal>
          </div>
        </section>

        {/* WHY — the outsource-your-email-layer narrative. */}
        <section id="why" className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
          <div className="container">
            <Reveal inView className="mx-auto mb-12 max-w-2xl text-center">
              <Badge className="mb-4">Why outsource it</Badge>
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Email is a product of its own. Don&apos;t maintain two.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Every backend grows an accidental email service — templates in code, delivery
                mysteries, compliance TODOs. rootmail is that service, finished.
              </p>
            </Reveal>
            <Reveal inView delay={0.08} className="grid gap-4 sm:grid-cols-2">
              {whyPoints.map((w) => (
                <div key={w.title} className="rounded-2xl border bg-card p-6">
                  <span className="mb-3 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <w.icon className="size-5" />
                  </span>
                  <h3 className="font-semibold">{w.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{w.body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* THE API — the moved showcase. */}
        <div id="api">
          <CodeShowcase />
        </div>

        {/* SURFACE — entry-point agnostic, stated concretely. */}
        <section id="surface" className="border-t border-border/60 py-20 md:py-28">
          <div className="container">
            <Reveal inView className="mx-auto mb-12 max-w-2xl text-center">
              <Badge className="mb-4">Parity, not a subset</Badge>
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Everything the dashboard does, the API does.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                The web dashboard, the SDK, the CLI, and raw REST are four doors into one product —
                whatever gets built no-code is yours to drive in code, and vice versa.
              </p>
            </Reveal>
            <Reveal inView delay={0.08} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {surface.map((s) => (
                <div key={s.name} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                    <s.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.note}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* GUARANTEES + CTA */}
        <section className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
          <div className="container grid items-center gap-10 lg:grid-cols-2">
            <Reveal inView>
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              The guarantees you&apos;d have to build yourself
              </h2>
              <ul className="mt-6 space-y-3">
                {guarantees.map((g) => (
                  <li key={g} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-3.5" />
                    </span>
                    {g}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal inView delay={0.1} className="rounded-2xl border bg-card p-8 text-center">
              <h3 className="text-xl font-bold">3,000 sends a month, free. No card.</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Then blocks of 25,000 sends priced to drop as you grow — and sandbox sends never
                count. Live prices are on the main site; add-ons ride the same bill.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <CtaButton label="Get an API key" size="lg" arrow />
                <Link
                  href="https://marketing.gateml.io/pricing"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  See live pricing
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <DevFooter />
    </>
  );
}
