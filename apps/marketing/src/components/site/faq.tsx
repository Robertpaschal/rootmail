import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    q: "Do I need to know how to code to use rootmail?",
    a: "No. The dashboard is a full no-code console: write and design templates in a visual editor, build contact lists, send campaigns, automate drip sequences, read replies in a shared inbox, and watch open and click rates — all without writing a line of code. An AI assistant can even draft a template or build a sequence for you — and if your team includes developers, they get the exact same product in code at developers.gateml.io.",
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
    a: "Yes. Mail is encrypted in transit, credentials are stored only in protected form, and optional two-factor sign-in, login lockout, and per-person permissions protect your account. Your data is strictly isolated to your organization — no other customer can ever see it. You can export everything or delete your account at any time, and we publish our privacy policy, security practices, and a DPA.",
  },
  {
    q: "What does it cost?",
    a: "Each product is priced by what it actually uses. Transactional: 3,000 sends a month free, then blocks of 25,000 sends with rates that drop as you grow — and overage never stops your sending. Marketing: free up to 500 contacts, then your audience size sets the price and the plan turns it into monthly volume and daily capacity. Extras (seats, workspaces, SSO, AI credits, dedicated IPs) are add-ons priced per one — buy them with a plan in one bill, or on their own with no plan at all. Yearly is 2 months free; sandbox (test) sends are always free.",
  },
  {
    q: "My team has developers — can they plug into this?",
    a: "Yes, fully. Everything you do in the dashboard, a developer can do in code — same product, same data. The whole technical story (and the docs) lives at developers.gateml.io, so your developers get their own front door while you never have to touch code.",
  },
  {
    q: "Can I get notified of deliveries, opens, and replies?",
    a: "Yes — point a webhook endpoint at your app and rootmail sends signed, idempotent events for the full lifecycle (delivered, opened, clicked, bounced, complained) plus inbound replies, with a per-endpoint delivery log you can inspect and replay.",
  },
  {
    q: "Can I send email on behalf of my clients?",
    a: "Yes — that's what client domains are for. Each client sends from their own name and web address, with their sending reputation, contacts, and history kept separate from everyone else's. Agencies run all their clients from one account; most other senders never need this, but it's there the day you do.",
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
