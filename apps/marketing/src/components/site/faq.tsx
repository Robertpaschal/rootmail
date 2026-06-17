import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    q: "How is this different from Resend or Mailchimp?",
    a: "Those are separate products for separate jobs — transactional, marketing, and sales each live in their own silo. rootmail is one data model that satisfies all three, so you never re-platform as your needs change. The sub-tenancy and proof layers simply don't exist in those tools.",
  },
  {
    q: "What exactly is a sub-tenant?",
    a: "A customer of yours that sends under their own verified domain. You provision it via the API, hand them DNS records to publish (ownership, DKIM, SPF), verify, then send on their behalf — with reputation, contacts, and audit trails isolated per tenant but rolling up to your workspace.",
  },
  {
    q: "Is there an SDK?",
    a: "Yes — @rootmail/node ships today with a fully typed client and withSubTenant() scoping, covering messages, sub-tenants, templates, sequences, lists, campaigns, threads, and proof. A Python SDK is planned.",
  },
  {
    q: "What's the difference between live and test keys?",
    a: "Keys are prefixed rm_live_… and rm_test_…. Test-mode sends are sandboxed and never reach a real provider, so you can exercise the full pipeline in CI without sending mail.",
  },
  {
    q: "Can I self-host?",
    a: "rootmail is a standard TypeScript monorepo — a Fastify API, a BullMQ worker, Postgres, and Redis — so it runs anywhere Docker does. Managed cloud hosting is on the roadmap.",
  },
  {
    q: "Are Conversation and Proof available yet?",
    a: "Yes — all three layers are live today. Layer 2 (Conversation) gives you inbound parsing, threads, a shared inbox, and exit-on-reply; Layer 3 (Proof) gives you Ed25519-signed, exportable lifecycle bundles with a content hash. Turn each on as you need it — same API, nothing to migrate.",
  },
];

export function Faq() {
  return (
    <section className="py-20 md:py-28">
      <div className="container max-w-3xl">
        <div className="mb-12 text-center">
          <Badge className="mb-4">FAQ</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Questions, answered
          </h2>
        </div>

        <div className="divide-y rounded-2xl border bg-card">
          {faqs.map((f) => (
            <details key={f.q} className="group px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
