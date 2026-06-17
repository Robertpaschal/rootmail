import {
  Fingerprint,
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
    icon: MessagesSquare,
    title: "Threads & shared inbox",
    desc: "Inbound replies are parsed, threaded, and routed back via webhook or a shared inbox — and sequences exit automatically on reply.",
  },
  {
    icon: ShieldCheck,
    title: "Signed proof bundles",
    desc: "Export an Ed25519-signed record of any message's full lifecycle — content hash included — for compliance and disputes.",
  },
  {
    icon: Workflow,
    title: "Sequences & campaigns",
    desc: "Drip sequences with delays and exit-on-reply, plus list-based campaigns — all metered against your plan, with stats.",
  },
  {
    icon: ScrollText,
    title: "Append-only audit trail",
    desc: "Every lifecycle event — queued, sent, delivered, opened, clicked — is logged immutably and queryable per message.",
  },
  {
    icon: ShieldOff,
    title: "Suppression & contacts",
    desc: "Bounces, complaints, and unsubscribes are checked before every send and scoped per workspace or sub-tenant.",
  },
  {
    icon: Sparkles,
    title: "AI drafting & no-code studio",
    desc: "Draft templates with AI and refine them in a no-code editor — or let the assistant build and operate features for you.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">The platform</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a production email system needs
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            All three layers — identity &amp; sending, conversation, and proof — are built and
            verified end-to-end, behind one API, one SDK, and a full operator dashboard.
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
