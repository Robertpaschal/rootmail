import { Plus } from "lucide-react";

/**
 * "What am I still worried about?"
 *
 * Two edits beyond the restyle, both about claims rather than looks:
 *
 * 1. The old data answer said your data is isolated so that "no other customer
 *    can EVER see it". An absolute in the future tense is a claim no codebase
 *    can earn; the honest version names the scoping and names the tests that
 *    exist to catch a regression in it (`apps/api/src/routes/isolation.test.ts`,
 *    which drives real HTTP against a real database).
 * 2. "How does rootmail keep my email out of spam?" promised an outcome nobody
 *    can promise. The question now asks what we DO, which is a question we can
 *    answer completely.
 *
 * A `<details name="faq">` list is the correct control here and it stays.
 *
 * ── WHY IT DIDN'T FEEL SMOOTH, MEASURED (2026-08-31) ────────────────────────
 * The owner: *"questions and answers, the opening and closing… should feel
 * smooth. Right now, it doesn't… it feels flat."* Both halves were true and
 * both were mechanical:
 *
 * 1. **The timing was one tier out.** Read off the built page, the transition
 *    was `block-size 0.1s` — `--t-interaction`, chosen on the reasoning that a
 *    disclosure answers a click. 100ms across ~150px of panel does not read as
 *    opening; it reads as appearing. It is `--t-narrative` on `--ease-narrative`
 *    now, which front-loads hard: ~85% open by 245ms, then it settles. The
 *    answer also slides down 8px as it arrives — transform only, never opacity,
 *    so with the transition dead it is a paragraph eight pixels out of place
 *    rather than a paragraph that is not there.
 * 2. **Open and closed were the same surface.** A ruled row growing taller is
 *    not a state change you can see from across the room. The list is a pressed
 *    tray now and the open row is lifted OUT of it, on the raised ground with
 *    elevation under it — the same tray-and-lift vocabulary as the hero deck,
 *    the pricing meters and the defaults list, so the page reads as one system.
 *
 * The easing lives in `globals.css` on `.faq-item` / `::details-content`, not
 * here, because it needs a pseudo-element. Both halves are progressive: with no
 * `::details-content` support the panel snaps open, which is what it did before.
 */
const faqs = [
  {
    q: "How do I send to a list?",
    a: "Import your contacts (or paste them in), group them into a list, and send a campaign to the whole list from the dashboard — or set up a sequence that emails people automatically over days. Already on another provider? You can bring your contacts and your unsubscribe/suppression list straight over from a SendGrid, Postmark, or Mailgun export, so you keep your history and don't email anyone who opted out.",
  },
  {
    q: "What do you do about deliverability?",
    a: "Four things, none of them a promise about the inbox — nobody can make that promise. We authenticate with DKIM, SPF and DMARC and generate the records to publish. We stop sending to addresses that bounced or marked you as spam, before each send. We score you 0–100 from what actually happened over the last 7 days, and name what is moving it. And we re-check your DNS hourly, so a record that disappears is something you hear from us within the hour.",
  },
  {
    q: "Do I need my own domain?",
    a: "You can start sending right away while you get set up. To send from your own address (you@yourbusiness.com), you add a few DNS records we generate for you — copy, paste into your domain provider, and we verify them for you. The dashboard walks you through it and tells you the moment everything checks out. You never click 'verify' twice: we do the waiting.",
  },
  {
    q: "Is my data safe?",
    a: "Mail is encrypted in transit and credentials are stored only in protected form. Two-factor sign-in, login lockout and per-person permissions protect the account. Every request is scoped to your organization and workspace, and that scoping is covered by tests written to fail if it regresses — which is more useful than an absolute promise about the future. You can export everything or delete your account at any time.",
  },
  {
    q: "What does it cost?",
    a: "You pay for two things and nothing else: how many emails you send, and how many contacts you keep. Sends: 3,000 sends a month free, then blocks of 25,000 with rates that drop as you grow, and going over never stops your sending. Contacts: free up to 500, then the size of your list sets the price. Every feature is on every plan including the free one; extras like seats, workspaces, SSO, AI credits and dedicated IPs are bought one at a time if you want them. Yearly is 2 months free, and sandbox sends are always free.",
  },
  {
    q: "Are there webhooks?",
    a: "Yes — point a webhook endpoint at your app and rootmail sends signed, idempotent events for the full lifecycle (delivered, opened, clicked, bounced, complained) plus inbound replies, with a per-endpoint delivery log you can inspect and replay.",
  },
  {
    q: "Can I send for my clients?",
    a: "Yes — that's what client domains are for. Each client sends from their own name and web address, with their bounces, complaints, contacts and history scored and stored separately. Clients share one provider account and one IP pool, which we draw rather than hide: what we do about it is measure each client on its own and throttle, then pause, the one going wrong. Agencies run all their clients from one account; most other senders never need this.",
  },
  {
    q: "How is this different from Resend or Mailchimp?",
    a: "Those are separate products for separate jobs, so you pay two bills, keep two contact lists, and build two sending reputations — for the same customers. rootmail puts every email your business sends in one place, which is why an unsubscribe here means everywhere. The sharper difference is what we draw: an open is a tracking pixel firing, and we render it as an inference rather than at the same weight as a delivery the provider confirmed.",
  },
];

export function Faq() {
  return (
    <section className="slab settle ground-linen">
      <div className="container grid gap-10 py-14 md:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-20">
        <h2 className="display-m lg:sticky lg:top-28 lg:self-start">Questions, answered</h2>

        <div className="rounded-2xl bg-well p-2 shadow-well sm:p-3">
          <div className="ruled">
            {faqs.map((f) => (
              /* `name` makes this an EXCLUSIVE accordion natively — opening one
                 closes the others, with no JavaScript and no state to get out of
                 sync. A browser without it degrades to independent toggles,
                 which is the old behaviour rather than a broken one. */
              <details key={f.q} name="faq" className="group faq-item px-4">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[0.9375rem] font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Plus className="size-4 shrink-0 text-ink-muted transition-transform duration-interaction ease-interaction group-open:rotate-45" />
                </summary>
                <p className="faq-answer max-w-2xl pb-6 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
