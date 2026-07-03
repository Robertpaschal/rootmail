import { eq } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { closeDb, db } from "./client";
import { blogPosts } from "./schema";

// Prod-safe blog refresh (2026-07): upgrades the three thin baseline posts into
// full articles and adds one new guide. Idempotent — updates overwrite by slug,
// the insert is skipped when the slug exists. Run like the other seeds:
//   docker compose run --rm --no-deps api pnpm db:seed:blog-refresh
// then revalidate the marketing `blog` tag.

const UPDATES: { slug: string; description: string; body: string }[] = [
  {
    slug: "land-in-the-inbox-not-spam",
    description:
      "Deliverability isn't a dark art — it's a checklist. Authentication, warm-up, list hygiene, content, and the numbers to watch, with what rootmail handles for you.",
    body: `Deliverability sounds like a dark art, but most of it comes down to a short list of fundamentals. Mailbox providers ask three questions about every message: can the sender prove who they are, do people seem to want this mail, and does the sending pattern look human? Get those right and you'll reach the inbox far more often. Here's the full checklist — and what rootmail already handles for you.

## 1. Prove who you are

Authentication is table stakes. Before anything else, your domain needs three DNS records:

- **SPF** lists the servers allowed to send for your domain.
- **DKIM** signs every message so nobody can tamper with it in transit. rootmail generates and rotates DKIM keys for every sending domain — including each sub-tenant's — automatically.
- **DMARC** tells receivers what to do when a message fails the first two, and gives you reports on who's spoofing you. Start at p=none to observe, then move to quarantine and reject as your traffic proves clean.

Run the domain check in rootmail (Deliverability → your domain, or just ask the assistant "is my domain set up?") and it will grade SPF, DKIM, DMARC, and BIMI with copy-paste fixes for anything missing. BIMI — your logo next to the message in supporting inboxes — is optional, but it's a nice trust signal once DMARC is enforcing.

## 2. Warm up before you pour

Reputation is earned per domain and per IP, and providers distrust sudden volume from a quiet sender. If your domain is new, ramp up: hundreds of sends a day in week one, low thousands in week two, doubling as engagement holds. Send consistently — five thousand a day beats thirty-five thousand every Friday. If you're on a dedicated IP, the same logic applies to it.

## 3. Keep the list clean

Nothing burns reputation faster than mailing people who never asked or who left long ago.

- **Let bounces and complaints do their job.** rootmail suppresses hard bounces, complaints, and unsubscribes automatically and checks the list before every single send — you cannot accidentally re-mail someone who opted out.
- **Bring your suppression history with you.** If you're migrating, import your old provider's suppression export first, then your contacts. Reputation transfers with your hygiene, not your domain.
- **Sunset the silent.** If someone hasn't opened in months, slow down or stop. A smaller, engaged list outperforms a big cold one on every metric that matters.

## 4. Send things people open

Content still counts. The reliable rules: a subject line that tells the truth about what's inside; a from-name people recognize (and keep constant); one clear call to action; and a working unsubscribe link — hiding it just converts tired readers into complainers, and complaints cost far more than unsubscribes. rootmail renders a plain-text part alongside your HTML automatically, which both filters and humans appreciate.

## 5. Watch the numbers that matter

You can't manage what you don't measure. Three thresholds to keep in view:

- **Bounce rate under 2%.** Above that, your list quality is the problem.
- **Complaint rate under 0.1%.** Above that, your targeting or frequency is.
- **Delivery rate at 98%+.** Below that, work back through this checklist.

rootmail distills all of this into a 0–100 reputation score computed from your real outcomes, and every campaign and sequence shows its own sent → delivered → opened → clicked funnel, so a problem shows up in one send — not in next quarter's aggregate.

## The checklist

1. SPF, DKIM, DMARC pass (and BIMI when you're ready) — verify in Deliverability.
2. New domain or IP? Ramp volume gradually and send on a steady rhythm.
3. Import suppressions before contacts when migrating.
4. Never buy lists; sunset silent subscribers.
5. Honest subject, consistent from-name, one CTA, visible unsubscribe.
6. Watch bounce (<2%), complaints (<0.1%), delivery (98%+), and your reputation score.

Run it top to bottom once, then let the monitoring tell you when anything drifts. That's the whole art.`,
  },
  {
    slug: "no-code-first-campaign",
    description:
      "From CSV to a measured send — the entire campaign flow in the rootmail dashboard, no developer required, ending with the funnel that tells you how it landed.",
    body: `You don't need a developer to send a great email with rootmail. Here's the whole flow, start to finish, entirely in the dashboard — ending with the part most tools skip: knowing how it actually landed.

## Step 1 — Bring in your contacts

Head to **Audience → Import**. Drop in a CSV, or the export straight out of SendGrid, Postmark, or Mailgun — rootmail understands their formats natively. Import your old **suppression list first** if you're migrating, so the people who unsubscribed there stay unsubscribed here. Your sending reputation will thank you.

## Step 2 — Make a list

Campaigns send to lists. Create one under **Audience → Lists** ("Newsletter", "Beta users" — whatever maps to how you talk to people) and add contacts to it. A contact can live on as many lists as you like; suppression is checked at send time regardless of list membership.

## Step 3 — Write the email

Under **Content → Templates**, build the message. The template editor gives you a visual constructor — blocks, styles, live preview — and supports placeholders like a first name, so every message reads personally. Prefer to describe it instead of building it? Ask the AI assistant for "a launch announcement template, dark header, one button" and refine from what it drafts.

## Step 4 — Rehearse in the sandbox

Every workspace has a free test mode. Send the template to yourself through the sandbox: check the subject line on your phone, click the links, squint at the preview text. Test sends never touch your quota or your reputation.

## Step 5 — Send the campaign

Under **Messaging → Campaigns**, create the campaign: pick the list, pick the template, set the subject. Send now or schedule it. rootmail meters the send against your plan, skips every suppressed address automatically, and fans the rest out through the pipeline with full audit logging per message.

## Step 6 — Watch it land

Open the campaign afterward and you'll find its own funnel: **sent → delivered → opened → clicked**, with delivery, open, and click rates. Delivery at 98%+ means your setup is healthy. A weak open rate points at the subject or sender name; a weak click rate points at the content. One send, and you already know what to fix next time.

## Or say the whole thing in one sentence

The AI assistant can run this entire flow: *"Create a list called Beta, add these three addresses, draft a launch template, and send it as a campaign."* It plans the steps, reuses anything you already have, executes within your plan and permissions, and reports back a checklist of everything it did — with ids you can click into.

Ten minutes, zero code, and a funnel that tells the truth. That's a first campaign done properly.`,
  },
  {
    slug: "why-we-built-rootmail",
    description:
      "Every company ends up running three email stacks that don't talk to each other. rootmail is the layered replacement: one API, one audience, one audit trail — with an assistant that operates it.",
    body: `Every company sends email, and almost every company ends up with the same mess. You start with one service for receipts and password resets. Then marketing wants newsletters, so a second tool arrives with its own editor, its own list, its own unsubscribe state. Then sales adds a sequencing tool — a third sender, a third reputation, a third place someone can complain. Before long, "email" is three bills, three dashboards, and three versions of the truth about the same customer.

The absurd part is that it's all the same channel. The same domain. Often the same recipient, on the same day.

## One substrate, in layers

rootmail is built as one platform with layers, so you adopt exactly as much as you need:

- **The send layer** — one API for transactional, marketing, and sales mail, with idempotency keys for exactly-once delivery, scheduling, priority lanes, and Handlebars templates.
- **The trust layer** — automatic DKIM, SPF/DMARC/BIMI guidance, suppression checked before every send, a 0–100 reputation score from real outcomes, and an append-only audit trail for every message's life.
- **The audience layer** — contacts, lists, drip sequences that exit on reply, list-based campaigns, and a shared inbox for what comes back. Each campaign and sequence carries its own engagement funnel.
- **The operating layer** — an in-app AI assistant that doesn't just answer questions about your email but does the work: builds templates and sequences, runs sends, and diagnoses problems ("why did this bounce?") with the actual evidence, inside your plan and permissions.

One audience. One suppression state. One audit trail. One bill.

## Sub-tenancy from day one

The moment your product sends email *for your customers* — invoices from their brand, notifications from their domain — most stacks fall apart. rootmail treats sub-tenancy as a first-class primitive: every customer gets their own verified sending domain with isolated DKIM keys and isolated reputation, managed through the same API you already use. A platform with a thousand customers is a thousand clean senders, not one shared blast radius.

## Trust as a feature, not a promise

Email is evidence. Companies get asked to prove a message was sent, when, and what it said. rootmail's audit log is append-only — events are written, never edited — and you can export Ed25519-signed proof bundles that anyone can verify without trusting us. Retention policies (redact or delete on your schedule) are configurable per workspace, so compliance is a setting, not a project.

## Honest economics

Usage-based pricing that scales with what you send, a free sandbox that never expires, yearly plans that show exactly what you save, and an upgrade path that appears where you actually hit a limit — not buried three menus deep. When you outgrow a tier, the platform tells you what fixes it and what it costs.

We built rootmail because email infrastructure should be one coherent thing you can trust and operate — not a committee of tools that have never met. If that's the mess you're in, the migration importer takes about ten minutes, and your reputation comes with you.`,
  },
];

const NEW_POST = {
  slug: "reading-your-campaign-funnel",
  title: "Reading your campaign funnel: where email actually drops off",
  description:
    "Sent, delivered, opened, clicked — four numbers that tell you exactly what to fix. How to read the funnel on every rootmail campaign and sequence, and what 'good' looks like.",
  category: "Guide" as const,
  author: "rootmail",
  body: `Every campaign and sequence in rootmail now ships with its own engagement funnel: **sent → delivered → opened → clicked**. Four numbers, one story. The skill is knowing which gap you're looking at — because each stage drops for a different reason, and each has a different fix.

## Sent → delivered: the infrastructure gap

This is the only gap that's about *plumbing*, not people. Mail goes missing here for three reasons:

- **Bounces** — the address doesn't exist (hard) or the mailbox is temporarily refusing (soft). rootmail suppresses hard bounces automatically so they can't hurt you twice.
- **Authentication** — SPF, DKIM, or DMARC failing at the receiver. Run the domain check under Deliverability; it grades each record and hands you the fix.
- **Reputation** — a provider quietly rate-limiting or rejecting you because of past bounces or complaints. Your 0–100 reputation score tracks this from real outcomes.

Healthy delivery is **98% or better**. Below that, stop tuning subject lines — nothing downstream matters until this stage is fixed.

## Delivered → opened: the attention gap

The message arrived; did anyone care? Opens are driven by three things you control: the **subject line** (honest and specific beats clever), the **from-name** (recognizable and constant), and **timing** (when your audience actually reads mail).

One honest caveat: opens are *directional*, not exact. Privacy features in modern mail clients pre-fetch images and can register opens the reader never made, so treat the open rate as a trend line — compare this campaign against your last five, not against an absolute truth. rootmail already filters the obvious proxy pre-fetch patterns, but no provider can make opens perfect.

## Opened → clicked: the content gap

They read it; did it move them? Weak clicks with healthy opens means the inside didn't deliver what the subject promised. The fixes are editorial: one clear call to action instead of four, the link visible without scrolling, and copy that gets to the point. Watch **click-to-open** (clicks as a share of opens) — it isolates content quality from list quality better than the raw click rate does.

## Sequences: find the leaky step

Sequences add a dimension campaigns don't have: **time**. The per-step breakdown on every sequence shows sent, delivered, opened, and clicked for each step, so you can see exactly where people stop engaging. A cliff at step three usually means the wait before it is too short (you're crowding them) or the content stopped earning its place. And because rootmail sequences exit automatically on reply, a "drop-off" can also be your success metric in disguise — people who answered step two never needed step three.

## What good looks like

Ranges, not laws — audiences differ:

- **Delivery:** 98%+ (bounce under 2%)
- **Complaints:** under 0.1% — this one is a law
- **Opens:** 20–40% for a warm list, read as a trend
- **Click-to-open:** 10–20% for content that's working

## Where to find it

Open any campaign from **Messaging → Campaigns** for its funnel and rates. Open any sequence for the funnel plus the per-step table. Workspace-wide numbers live under **Insights → Analytics**, and if you'd rather ask than look: the assistant answers "how did my last campaign do?" with the same data — and "why did this bounce?" with the actual audit evidence.

Four numbers, read in order: fix delivery first, then attention, then content. That's the whole discipline.`,
};

async function main(): Promise<void> {
  let updated = 0;
  for (const u of UPDATES) {
    const res = await db
      .update(blogPosts)
      .set({ description: u.description, body: u.body, updatedAt: new Date() })
      .where(eq(blogPosts.slug, u.slug))
      .returning({ slug: blogPosts.slug });
    if (res.length) updated++;
    else console.warn(`  ! slug not found (skipped): ${u.slug}`);
  }

  const [existing] = await db
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(eq(blogPosts.slug, NEW_POST.slug))
    .limit(1);
  let inserted = 0;
  if (!existing) {
    await db.insert(blogPosts).values({
      id: newId("blogPost"),
      slug: NEW_POST.slug,
      title: NEW_POST.title,
      description: NEW_POST.description,
      category: NEW_POST.category,
      author: NEW_POST.author,
      body: NEW_POST.body,
      status: "published",
      publishedAt: new Date(),
      createdBy: null,
    });
    inserted = 1;
  }
  console.log(`blog refresh: ${updated} updated, ${inserted} inserted`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
