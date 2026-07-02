import {
  ArrowLeftRight,
  BarChart3,
  Fingerprint,
  Gauge,
  MessagesSquare,
  Network,
  ScrollText,
  Send,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Send,
    title: "Flexible Send API",
    desc: "Transactional, marketing, and sales sends from one endpoint — Handlebars templates or inline HTML, scheduled delivery, and priority lanes.",
  },
  {
    icon: Fingerprint,
    title: "Exactly-once delivery",
    desc: "Pass an idempotency_key and rootmail guarantees a single send. Safe retries, no duplicate emails to your users.",
  },
  {
    icon: Network,
    title: "Built-in sub-tenancy",
    desc: "Give every customer a verified sending domain — DKIM, SPF, and reputation isolated — without rebuilding your stack.",
  },
  {
    icon: Gauge,
    title: "Deliverability tools",
    desc: "A 0–100 reputation score from real outcomes, plus SPF, DKIM, DMARC and BIMI setup guidance for every sending domain.",
  },
  {
    icon: BarChart3,
    title: "Engagement analytics",
    desc: "The sent → delivered → opened → clicked funnel — platform-wide and per campaign or sequence, with per-step drop-off, daily trends, and top templates.",
  },
  {
    icon: Workflow,
    title: "Sequences & campaigns",
    desc: "Drip sequences with delays and exit-on-reply, plus list-based campaigns — metered against your plan, each with its own engagement funnel.",
  },
  {
    icon: MessagesSquare,
    title: "Threads & shared inbox",
    desc: "Inbound replies are parsed, threaded, and routed back via webhook or a shared inbox — and sequences exit automatically on reply.",
  },
  {
    icon: ShieldCheck,
    title: "Proof & compliance",
    desc: "Ed25519-signed proof bundles and audit-grade exports anyone can verify, plus configurable redact/delete data-retention policies.",
  },
  {
    icon: ScrollText,
    title: "Append-only audit trail",
    desc: "Every lifecycle event — queued, sent, delivered, opened, clicked, bounced — is logged immutably and queryable per message.",
  },
  {
    icon: ShieldOff,
    title: "Suppression & contacts",
    desc: "Bounces, complaints, and unsubscribes are checked before every send and scoped per workspace or sub-tenant.",
  },
  {
    icon: ArrowLeftRight,
    title: "Migrate in minutes",
    desc: "Import your suppression list and contacts straight from a SendGrid, Postmark, or Mailgun export — no reputation lost.",
  },
  {
    icon: Sparkles,
    title: "AI assistant",
    desc: "An in-app agent that plans multi-step work, builds, operates, and diagnoses your email — “why did this bounce?” — then reports back a checklist of what it did.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">Capabilities</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a production email system needs
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Reach for what you need today, with room to grow into the rest — every capability works
            from the no-code dashboard and the API alike, so your team and your developers share one
            source of truth.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
