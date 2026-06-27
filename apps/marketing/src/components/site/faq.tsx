import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    q: "Do I need to know how to code to use rootmail?",
    a: "No. The dashboard is a full no-code console: write and design templates in a visual editor, build contact lists, send campaigns, automate drip sequences, read replies in a shared inbox, and watch open and click rates — all without writing a line of code. An AI assistant can even draft a template or build a sequence for you. Developers get a REST API, a typed Node SDK, and a CLI for the exact same features.",
  },
  {
    q: "How do I send to my contacts or a mailing list?",
    a: "Import your contacts (or paste them in), group them into a list, and send a campaign to the whole list from the dashboard — or set up a sequence that emails people automatically over days. Already on another provider? You can bring your contacts and your unsubscribe/suppression list straight over from a SendGrid, Postmark, or Mailgun export, so you keep your history and don't email anyone who opted out.",
  },
  {
    q: "How does rootmail keep my email out of spam?",
    a: "Deliverability is treated as part of the product, not an afterthought. We authenticate your mail with DKIM, SPF, and DMARC, automatically stop sending to addresses that bounced or marked you as spam, and give you a 0–100 reputation score from your real sending outcomes with specific fixes when something looks off. You also get the exact DNS records to publish for the strongest possible setup.",
  },
  {
    q: "Do I need my own domain, and is the DNS setup hard?",
    a: "You can start sending right away while you get set up. To send from your own address (you@yourcompany.com), you add a few DNS records we generate for you — copy, paste into your domain provider, and we verify them for you. The dashboard walks you through it and tells you the moment everything checks out.",
  },
  {
    q: "Is my data safe?",
    a: "Yes. Mail is encrypted in transit, API keys and passwords are only ever stored hashed, and optional two-factor sign-in, login lockout, and role-based permissions protect your account. Your data is strictly isolated to your organization — no other customer can ever see it. You can export everything or delete your account at any time, and we publish our privacy policy, security practices, and a DPA.",
  },
  {
    q: "What does it cost?",
    a: "Start free with 3,000 emails a month — no credit card. Paid plans add volume and capabilities (reply threads, sequences, campaigns, sub-tenants, proof bundles), and you only pay overage for what you actually send beyond your plan. See the pricing page for the full breakdown; sandbox (test) sends are always free.",
  },
  {
    q: "Is there an API and an SDK for developers?",
    a: "Yes. Everything in the product is available over a clean REST API (Bearer-token auth, snake_case JSON, idempotent by default), the typed @rootmail/node SDK, and a CLI. They cover sending, templates, sequences, lists, campaigns, threads, sub-tenants, webhooks, deliverability, analytics, proof exports, and the assistant.",
  },
  {
    q: "Can I get notified of deliveries, opens, and replies?",
    a: "Yes — point a webhook endpoint at your app and rootmail sends signed, idempotent events for the full lifecycle (delivered, opened, clicked, bounced, complained) plus inbound replies, with a per-endpoint delivery log you can inspect and replay.",
  },
  {
    q: "What is a sub-tenant — and do I need one?",
    a: "Only if you send on behalf of your own customers (you're building a platform). A sub-tenant is one of your customers sending under their own verified domain, with their reputation, contacts, and audit trail isolated but rolling up to you. Most senders never need this — but it's there the day you do, with no re-platforming.",
  },
  {
    q: "How is this different from Resend or Mailchimp?",
    a: "Those are separate products for separate jobs — transactional email, marketing campaigns, and sales outreach each live in their own silo. rootmail is one data model that does all three, so you never re-platform as your needs change. Per-customer sub-tenancy and cryptographically signed proof of exactly what you sent simply don't exist in those tools.",
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
