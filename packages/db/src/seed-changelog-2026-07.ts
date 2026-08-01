import type { ChangeItem } from "@rootmail/core";
import { newId } from "@rootmail/core";
import { closeDb, db } from "./client";
import { changelogEntries } from "./schema";

// Prod-safe, idempotent: publishes the early-July release notes that shipped after
// the 2026-06-29 entries. Dedupes by title, so re-running is a no-op. Run it like
// the pricing/cms seeds (e.g. on the api host:
//   docker compose run --rm --no-deps api pnpm db:seed:changelog
// ), then revalidate the marketing changelog tag.

// NOTE: the Python/Go SDK changelog entry is intentionally held until they're
// published to PyPI / pkg.go.dev (otherwise "pip install rootmail" would 404).
// Add it back here as part of the publish step.
const ENTRIES: { title: string; date: string; changes: ChangeItem[] }[] = [
  {
    title: "When something doesn't work, we now say so",
    date: "2026-08-01",
    changes: [
      {
        kind: "Fixed",
        text: "Thirteen buttons across the dashboard could fail and tell you nothing — deleting an audience or a template, revoking a key or an invitation, unsubscribing someone, changing an add-on. The reason was thrown away before it reached you.",
      },
      {
        kind: "Fixed",
        text: "The worst of these were the deletes. The row usually disappears from view the moment you click, so a refusal looked exactly like a success — you'd only find out it was still there when you next loaded the page. Now the reason appears next to the button you pressed.",
      },
      {
        kind: "Improved",
        text: "Actions that were quietly doing nothing when something was missing now say what's missing — “an audience and an email address are both required” rather than a click that goes nowhere.",
      },
    ],
  },
  {
    title: "Campaigns tell you what's left, and who you're about to email",
    date: "2026-08-01",
    changes: [
      {
        kind: "Fixed",
        text: "Pressing Send on a campaign that wasn't ready did nothing at all — no error, no explanation, the page just reloaded. The reason was thrown away before it reached you. It's shown now.",
      },
      {
        kind: "New",
        text: "A campaign says whether it's ready before you send. Missing audience, missing content, no verified sending address — each one is named, with a link straight to the page that fixes it, and Send stays disabled until they're done.",
      },
      {
        kind: "New",
        text: "Send now tells you how many people it reaches, and asks once before it goes. Mail can't be unsent, and the old button never said who it was about to email.",
      },
      {
        kind: "New",
        text: "One progress rail runs the whole way — Build, Review, Sending, Delivered, Engagement — and it starts on the New campaign screen, so writing one is visibly the first leg of the journey rather than a separate form that drops you into a flow already underway.",
      },
      {
        kind: "Improved",
        text: "The one-click Send in the campaign list is now Review & send, taking you to the campaign where the count, the checks and the confirmation live.",
      },
    ],
  },
  {
    title: "Adding a client domain is a guided setup now",
    date: "2026-07-31",
    changes: [
      {
        kind: "Improved",
        text: "The page used to explain the three steps in a row of cards and then open the create form underneath them — so the steps described a process the page didn't actually walk you through, and everything after step one happened somewhere else after a redirect.",
      },
      {
        kind: "New",
        text: "Adding a client domain is now a proper setup: name the client and their domain, get the DNS records to publish right there with copy buttons on each one, then verify — moving forward a step at a time, with the same progress rail you already see when writing a message or launching a campaign.",
      },
      {
        kind: "Improved",
        text: "Verification tells you what actually happened. If the records haven't spread yet it says so and offers to check again, rather than looking like a failure. And you can stop after any step — the domain is saved and waiting under Client domains.",
      },
    ],
  },
  {
    title: "A profile that actually tells you who you are here",
    date: "2026-07-31",
    changes: [
      {
        kind: "Improved",
        text: "Profile showed an email with no label, leaving you to guess which one it was. It now says plainly: this is the address you sign in with and where we send you account mail — and it is not the address your recipients see, which is a sending address, and you can have several.",
      },
      {
        kind: "New",
        text: "Every workspace you can open is listed, not just the one you're in — each marked Live or Sandbox, with what that means, and a button to switch. Profile used to print a single “Workspace” value even though almost every account has at least two.",
      },
      {
        kind: "New",
        text: "Your sign-in section also shows whether your email is verified, whether two-factor is on, and when you joined.",
      },
      {
        kind: "Fixed",
        text: "Nothing in Settings opens itself any more. Two-factor setup and the postal address editor used to be unfolded before you asked, and the sending-address form sat open even when you had nothing to add — it's an empty state with an invitation now.",
      },
    ],
  },
  {
    title: "Settings pages that show you the answer first",
    date: "2026-07-31",
    changes: [
      {
        kind: "Improved",
        text: "Every setting used to sit in its own card with the editor already open — so an account you finished configuring months ago still looked like a half-filled form. Now each one states what it's set to, and the editor opens when you ask for it.",
      },
      {
        kind: "Improved",
        text: "Your postal address is shown as an address, with a preview of the footer it produces, instead of a permanently open text box. Same for your sending addresses: the list is the page, and the add form appears when you want to add one.",
      },
      {
        kind: "Improved",
        text: "Security is two plain rows now — two-factor with an On/Off badge, and a real switch for announcements — rather than two cards wrapped around two switches.",
      },
      {
        kind: "Fixed",
        text: "The reply settings still said your own reply domain was “coming soon”. It shipped a while ago — and it's the setting immediately below.",
      },
    ],
  },
  {
    title: "Settings now has a front page",
    date: "2026-07-31",
    changes: [
      {
        kind: "New",
        text: "Opening Settings used to drop you straight into Profile, so there was nowhere that answered “what can I change?”. There's now a map: every setting listed once, in plain language, grouped by what it's for.",
      },
      {
        kind: "New",
        text: "Each row shows what it's set to right now — whether two-factor is on, how many sending addresses are verified, where replies go, whether your postal address is filled in. You read it instead of opening four pages to find out.",
      },
      {
        kind: "New",
        text: "Search across all of it. Type “2fa”, “unsubscribe”, “okta” or “dns” and the right setting comes up, wherever it lives.",
      },
      {
        kind: "Improved",
        text: "Anything unfinished floats to the top under “Worth finishing” — a missing postal address, for instance, which marketing sends legally need in the footer.",
      },
      {
        kind: "Improved",
        text: "Settings that live in their own sections — your team and SSO, plan and usage, client domains, proof and retention, API keys and webhooks — are listed here too, labelled with where they actually are. Looking for SSO in Settings now finds it instead of finding nothing.",
      },
    ],
  },
  {
    title: "Pricing pages that say what you actually get",
    date: "2026-07-31",
    changes: [
      {
        kind: "Fixed",
        text: "Comparing plans quoted “from $6/block” when the first block is $8 — $6 is the rate at high volume. Every number on these pages now comes from the live price list, so what you read is what checkout charges.",
      },
      {
        kind: "Fixed",
        text: "Client sending domains and a dedicated IP were listed among what Transactional includes. They're add-ons you buy separately. Each product now shows what it includes and, kept clearly apart, what you can add on top.",
      },
      {
        kind: "Fixed",
        text: "Marketing implied every plan had multi-step sequences; they start on Growth, and the page now says so by name. The replies inbox was filed as a marketing perk — it's free on both sides, always.",
      },
      {
        kind: "Improved",
        text: "The list of what every plan includes used to open with the REST API and SDK, which made rootmail look like something you have to code against. It leads with what you can do without writing anything — design, send, see what happened, ask the assistant — and the API, SDKs and webhooks are still there, free, in a line at the end for the people who want them.",
      },
      {
        kind: "Improved",
        text: "Marketing's plan comparison now covers the things the wing actually grew: collecting subscribers with a signup page or embedded form, contact records with tags and lifecycle stages, and previewing the exact email each person will get.",
      },
      {
        kind: "Fixed",
        text: "Add-ons and Compliance still advertised a Data residency add-on that was retired — nothing to buy, and the link went nowhere. Compliance now states plainly that we run a single region and points you at us if you need another.",
      },
    ],
  },
  {
    title: "Replies that move with you",
    date: "2026-07-30",
    changes: [
      {
        kind: "Improved",
        text: "Opening and closing a conversation no longer snaps. Threads and individual emails unfold and fold on a spring, so you keep your place instead of hunting for it after the page jumps.",
      },
      {
        kind: "Improved",
        text: "The reply box grows as you write, up to a comfortable limit, rather than staying a two-line slot you have to scroll inside. The Reply button now says what it's doing — Reply, Sending, Sent — without changing size or shifting the layout.",
      },
      {
        kind: "Improved",
        text: "A reply you send slides into the thread as a new email instead of appearing out of nowhere, and folding the people list away is now one continuous movement from the full list to the strip of faces.",
      },
      {
        kind: "Improved",
        text: "Filtering and switching people got quieter: the selected filter pill travels between All and Needs reply, a single marker slides to whoever you're reading, and rows close the gap as they filter out. If your system asks for reduced motion, all of it is off.",
      },
    ],
  },
  {
    title: "Hide the sidebar — and get it back by brushing the edge",
    date: "2026-07-28",
    changes: [
      {
        kind: "New",
        text: "The main sidebar hides. Press ⌘\\ (Ctrl+\\), or use the new button in the top bar, and the page takes the full width. Your choice is remembered.",
      },
      {
        kind: "New",
        text: "With it hidden, move your cursor to the left edge and it slides back over the page on a frosted panel — the way macOS reveals a hidden dock. The page underneath doesn't reflow, so nothing you were reading jumps. Scroll it, click through it, and it leaves on its own when you move away; pin it from its header to keep it.",
      },
      {
        kind: "Improved",
        text: "Escape dismisses the revealed panel, following a link from it puts it away, and while hidden it's properly out of the way for keyboard and screen-reader users rather than merely off-screen.",
      },
    ],
  },
  {
    title: "Replies: give one conversation the whole screen",
    date: "2026-07-28",
    changes: [
      {
        kind: "New",
        text: "The list of people folds away to a strip of faces, so a long exchange with one contact can have the full width. Switching person stays one click away while it's collapsed, and it remembers how you left it.",
      },
      {
        kind: "New",
        text: "Search your conversations by name, address, or anything said in them — plus a \"Needs reply\" filter that shows, at a glance, how many people are waiting on you.",
      },
      {
        kind: "Improved",
        text: "The conversation header now says who you're talking to and whether they're waiting, and links straight to their record. The paragraph that used to sit above every reply box is one short line with the detail behind an (i).",
      },
      {
        kind: "Improved",
        text: "Client domains: the DNS records you actually came to copy now get the full width, and the identifiers and dates moved behind a \"Domain details\" disclosure.",
      },
    ],
  },
  {
    title: "A message now reads like an email, not a stack of boxes",
    date: "2026-07-28",
    changes: [
      {
        kind: "Improved",
        text: "The message page used to split one email across four cards — Content, Recipient, Details, Developer details — in two columns. They're now one thing: who it went to at the top, the message in the middle, attachments at the bottom, the way a mail client shows it.",
      },
      {
        kind: "Improved",
        text: "Everything else hides behind the header chevron you already know from Gmail: click it for from / reply-to / to / date / subject / what it was sent as — and the developer identifiers sit one layer deeper inside that, so you only ever see the layer you asked for.",
      },
      {
        kind: "Improved",
        text: "Activity is now collapsible and complete. It folds away by default (the progress bar above already tells the story) and, when you open it, shows every step including the ones the tracker abstracts — queued, sending, retries — each with the provider that handled it and the reason a bounce gave.",
      },
    ],
  },
  {
    title: "Not right for one person? Change just their copy",
    date: "2026-07-28",
    changes: [
      {
        kind: "New",
        text: "The campaign pre-flight now lets you edit one recipient's email. Open their copy, rewrite the subject or the message in the normal editor, and save — only they get that version. Everyone else keeps the campaign's normal copy.",
      },
      {
        kind: "New",
        text: "An edited copy wins over the template AND over any A/B variant, so it's genuinely the version chosen for that person. Edited recipients are marked in the list, and one click puts them back on the normal copy.",
      },
      {
        kind: "Improved",
        text: "Edits go through the normal send path: {{variables}} you type still fill in from that contact's record, and the required postal address + unsubscribe footer is still added. Editing is refused on a campaign that's already gone out, rather than quietly having no effect.",
      },
    ],
  },
  {
    title: "See the exact email before it goes — templates, messages and campaigns",
    date: "2026-07-28",
    changes: [
      {
        kind: "New",
        text: "The template studio is now a journey: Start → Design → Review & save. The canvas takes the whole width (the Blocks/Design/Inspect panel folds to the edge and stays how you leave it), and the preview is a real stage — a mail-client frame, desktop/tablet/mobile, light and dark, plus the plain-text part.",
      },
      {
        kind: "New",
        text: "Previews are filled in with your real details instead of raw {{braces}} — your company name, and a real person from your audience. You see a finished email, not a form with holes in it.",
      },
      {
        kind: "New",
        text: "Writing an email is now Write → Review & send. Review renders the message as the actual recipient, using their contact record — their name, and any custom fields you keep on them.",
      },
      {
        kind: "New",
        text: "Campaigns get a pre-flight: step through your audience and read each person's actual copy, including which A/B variant their tags select and why, before you press send.",
      },
      {
        kind: "Improved",
        text: "We stopped asking for things we can work out. Picking a template starter sets what it's for; the API name and the plain-text version are generated; the \"variables detected\" list and the personalization JSON box are gone. You're asked only for what we genuinely can't know — like an order number — one plain field each, with our best guess already filled in.",
      },
      {
        kind: "Improved",
        text: "Save and \"Send a test\" now sit at the END of the flow, where there's something to save and something to test.",
      },
    ],
  },
  {
    title: "A calmer dashboard: developer tools out of the way, testing where you write",
    date: "2026-07-27",
    changes: [
      {
        kind: "Improved",
        text: "The sidebar now runs in the order you actually work: Overview and Assistant, then Email, then Insights, then your product's account. Developer tooling (API keys, webhooks, docs, sandbox) moved to the bottom and folds away — one click to open, and it stays open once you do.",
      },
      {
        kind: "Improved",
        text: "The sandbox is no longer offered beside your live workspace in the workspace picker. It's a developer rehearsal room, not a second product, so you open it deliberately from Developers → Testing — and every screen inside it has a one-click way back.",
      },
      {
        kind: "New",
        text: "\"Send a test\" is now in the template studio too, next to Save: see the design you're building land in your own inbox, rendered by a real mail client.",
      },
      {
        kind: "Improved",
        text: "Test sends that took the real path can no longer be overwritten by a simulated event — their delivery, bounce and complaint results come from your provider, and stay that way.",
      },
    ],
  },
  {
    title: "Test recipients: prove your email really works, without risking anyone",
    date: "2026-07-27",
    changes: [
      {
        kind: "New",
        text: "Five reserved addresses at test.rootmail.dev each force a known outcome — clean delivery, hard bounce, spam complaint, provider suppression, out-of-office auto-reply. Mail to them takes the REAL send path (your DKIM key, your provider, your webhooks) but lands on a mailbox simulator, so no person receives it and your sending reputation is untouched even when you bounce on purpose.",
      },
      {
        kind: "New",
        text: "A new Testing section under Developers: pick what you want to prove, hit Run, and watch the expected outcome sit next to what actually happened. One button clears test suppressions so bounce scenarios can be run again.",
      },
      {
        kind: "New",
        text: "\"Send a test\" now lives in the composer — send the email you're writing to your own address to see how it really lands, or to a scenario address to force an outcome.",
      },
      {
        kind: "Improved",
        text: "The sandbox is honest about itself: it proves your integration, not delivery — and it now says so. The one exception is a test recipient, which really does go out from the sandbox too (free, up to 50 a day).",
      },
      {
        kind: "Improved",
        text: "Test sends are labelled as such in Messages and on the message page, so a deliberate bounce is never mistaken for a deliverability problem. The audit trail records exactly where each test went.",
      },
    ],
  },
  {
    title: "Two counters, made obvious — plus trend lines and a true sandbox",
    date: "2026-07-25",
    changes: [
      {
        kind: "Improved",
        text: "Your two send counters are now unmistakable everywhere: transactional sends (one-to-one, can't be unsubscribed from) and marketing sends (bulk, with a monthly allowance AND a daily cap, both scaled by your audience size). The Overview's marketing panel now shows send volume and today's cap — and Plan & usage states the definitions right next to the meters.",
      },
      {
        kind: "New",
        text: "Trend lines: Analytics charts sent, delivered, opened and clicked day by day, and Deliverability gains a daily delivery-health graph (deliveries vs bounces) plus levers that show YOUR standing — domains verified, volume, list health, engagement — each with a button that goes exactly where you act.",
      },
      {
        kind: "Improved",
        text: "Conversations teach the flow: when a thread starts from a campaign, the reply box says it plainly — replies are one-to-one, use your transactional sends, and a personal conversation can't be unsubscribed from.",
      },
      {
        kind: "Improved",
        text: "The sandbox is now unmissable and honest: a clear banner, only tools that actually work there, and \"Simulate a reply\" lives only in the sandbox — a live inbox contains real email from real people, enforced server-side.",
      },
      {
        kind: "Improved",
        text: "The Overview's workspace card shows what you're actually billed this month in one number, with the full breakdown one click away.",
      },
    ],
  },
  {
    title: "One dashboard — organized by what you're doing, with every email in its relationship",
    date: "2026-07-24",
    changes: [
      {
        kind: "New",
        text: "The sidebar is one product now: Email (messages, replies, campaigns, sequences, audience, templates, proof), Insights, Developers, and your workspace under its own name — no more flipping between Transactional and Marketing to find things.",
      },
      {
        kind: "New",
        text: "Every message now shows its relationship: who it reached (linked to their contact record and lifecycle stage), whether it came from a campaign, a sequence, or a one-to-one send, the rest of that person's history, and the live conversation when one is open.",
      },
      {
        kind: "New",
        text: "A contact's record surfaces their open conversations right on the activity timeline — messages out, replies back, one story.",
      },
      {
        kind: "Improved",
        text: "Team, roles, and single sign-on live together in one Team hub — invite someone, decide what they can do, and set how they sign in, all in one place.",
      },
      {
        kind: "Improved",
        text: "Analytics is one section for everything you send, with a one-tap switch between Everything, Transactional, and Marketing — no duplicate pages per wing.",
      },
      {
        kind: "Improved",
        text: "The sandbox now shows only what works in a sandbox (the test inbox appears there; deliverability and client domains wait for live) — and sandbox-only tools stay out of your live workspace.",
      },
      {
        kind: "Fixed",
        text: "Unsubscribes now stop only marketing mail. Password resets, receipts, and one-to-one replies always deliver — exactly as your customers expect.",
      },
    ],
  },
  {
    title: "The assistant, on every page — plus a clear view of your AI credits",
    date: "2026-07-22",
    changes: [
      {
        kind: "New",
        text: "Ask AI from anywhere: a new button follows you across the dashboard and opens the assistant right beside what you're doing — no need to leave the page. It even suggests the most useful things to ask for the section you're on (add someone to a list on Audience, “why did this bounce?” on Messages, and so on).",
      },
      {
        kind: "New",
        text: "Your AI credits are now always in view — a live meter in the assistant and the Ask-AI panel shows how many you have left this month.",
      },
      {
        kind: "Improved",
        text: "We nudge you before you run out: a gentle heads-up when credits are running low, and a clear “get more credits” prompt (one click to top up) the moment you hit zero — so the assistant never just stops without explanation.",
      },
    ],
  },
  {
    title: "A calmer CRM: cleaner contact pages, richer audiences, and an audience pack",
    date: "2026-07-21",
    changes: [
      {
        kind: "Improved",
        text: "The contact page is now presented, not permanently in edit mode: details, tags, and audiences show cleanly and open to edit or add only when you ask. Notes get their own composer, and the activity feed is one tidy timeline that scrolls instead of growing forever.",
      },
      {
        kind: "Improved",
        text: "Lifecycle suggestions: when someone's engagement says they've moved on — a subscriber who just clicked, or a customer gone quiet — the contact page offers a one-click stage change. You're always in control; nothing moves on its own.",
      },
      {
        kind: "Improved",
        text: "The lifecycle board's cards now show each person's current stage at a glance, with a proper menu to move them (the current stage is checked) — no more guessing.",
      },
      {
        kind: "New",
        text: "Each audience now has its own rich view: the lifecycle mix at a glance, searchable and filterable members that link straight to their profile, and the same from-empty-to-scale guidance as the People hub.",
      },
      {
        kind: "New",
        text: "Audience pack add-on: need a few more lists than your plan includes? Add +5 audiences on the same bill. As always, moving up a plan raises your allowance for less per audience — packs are the quick top-up.",
      },
      {
        kind: "Fixed",
        text: "Contact packs now show their real price at checkout instead of $0.",
      },
    ],
  },
  {
    title: "Your audience is now a real CRM — pipeline, board, and lifecycle stages",
    date: "2026-07-21",
    changes: [
      {
        kind: "New",
        text: "Every contact now has a lifecycle stage — Subscriber → Engaged → Customer → Champion, with an At-risk side lane. The Audience page opens with your pipeline at a glance: live counts per stage, click any to filter.",
      },
      {
        kind: "New",
        text: "A Board view sits next to the table: drag people between stage columns as the relationship changes (or use the card's move menu). Every move lands on the contact's timeline — “Moved to Customer (from Subscriber)”.",
      },
      {
        kind: "New",
        text: "Each contact's profile now carries a clickable pipeline bar — click ahead to escalate, back to de-escalate, “Mark at risk” when they go quiet and “Back on track” when they warm up.",
      },
      {
        kind: "Improved",
        text: "The empty Audience page now shows the three ways to get your first customers in — Grow (signup page + embed), Import, or add by hand — and your Overview checklist gained a “Turn on audience growth” step.",
      },
      {
        kind: "New",
        text: "For developers: stage on every contact, a stage filter on GET /v1/contacts, and GET /v1/contacts/stages for pipeline counts.",
      },
    ],
  },
  {
    title: "Grow your audience — and manage every customer like a CRM",
    date: "2026-07-20",
    changes: [
      {
        kind: "New",
        text: "Audiences now grow themselves: turn on signup for any audience and you get a hosted, branded signup page to share anywhere plus an embeddable form for your own site or blog. Double opt-in (on by default) confirms subscribers with a branded email from your verified address.",
      },
      {
        kind: "New",
        text: "New subscribers can start your welcome automation instantly — tag them on signup and any sequence triggered by that tag runs on its own. Subs and unsubs are tracked per audience with a 30-day growth view.",
      },
      {
        kind: "New",
        text: "Nobody bounces off your plan limit: signups that arrive while your audiences are full are safely waitlisted and admitted automatically — oldest first — the moment room opens up (an upgrade, a contact pack, or cleanup).",
      },
      {
        kind: "New",
        text: "Every contact is now a full CRM profile: edit their details and custom fields, tag them, move them between audiences, keep notes, unsubscribe/resubscribe or delete — with a complete activity timeline of signups, emails, opens, clicks and lifecycle changes.",
      },
      {
        kind: "New",
        text: "Contact packs: need room right now? Add +500 contacts as an add-on on your existing bill. Growing your plan's contact size stays cheaper per contact — packs are the quick overflow valve.",
      },
      {
        kind: "New",
        text: "For developers: public POST /v1/subscribe (JSON or a plain HTML form post), audience growth stats at GET /v1/lists/:id/growth, and full contact CRM endpoints (profile, edit, notes) — all documented.",
      },
    ],
  },
  {
    title: "Every email personalizes itself — from the contacts you already have",
    date: "2026-07-20",
    changes: [
      {
        kind: "New",
        text: "Create a contact once, and every send tailors itself: a template's {{name}}, {{first_name}}, {{phone}} and any custom fields you imported fill in from each recipient's own record — on transactional sends, every campaign recipient, and every sequence step. No per-person setup, ever.",
      },
      {
        kind: "New",
        text: "The composer's “Start from” grew up: pick a template category (Transactional, Marketing, Sales, General), then the exact template. Missing the one you need? “New template” opens the design studio in a new tab — your draft stays put — then one refresh pulls it in.",
      },
      {
        kind: "Improved",
        text: "Anything you type in the Personalization box still wins over the automatic contact details — explicit always beats automatic. The unsubscribe link stays rootmail's signed one.",
      },
      {
        kind: "Improved",
        text: "For developers: the docs gained a Personalization guide (precedence, built-ins, custom fields) and the SDK documents the auto-merge on `variables` — the API shape is unchanged, your existing sends just get smarter.",
      },
    ],
  },
  {
    title: "Replies grew up: real email threads, per subject, under each contact",
    date: "2026-07-20",
    changes: [
      {
        kind: "New",
        text: "Conversations are now threaded the way email actually works: one thread per subject, under the contact. A new subject starts a new thread; every reply lands on the thread it answers — “Re:” and “Fwd:” prefixes are understood. One contact, all their subjects, nothing sprawls.",
      },
      {
        kind: "New",
        text: "Every message in a thread renders as the full email it is — the real HTML body on white “email paper”, the sender and recipient, attachments, and its own lifeline: delivered, opened, clicked, each with times. Collapse or expand any email in the thread.",
      },
      {
        kind: "Improved",
        text: "Reply in context, two ways: a quick reply right in the thread, or “Open the full editor” — the complete composer (templates, formatting, attachments) prefilled with the contact and “Re:” subject, and your email lands back on that thread automatically. “New email” starts a fresh subject with the same contact.",
      },
      {
        kind: "Improved",
        text: "Honest accounting, stated in the thread: every reply is a real email send and counts toward your monthly and daily sending like any other message.",
      },
    ],
  },
  {
    title: "Get replies on your own domain",
    date: "2026-07-18",
    changes: [
      {
        kind: "New",
        text: "Own a domain? Have replies come back on it — recipients reply to reply.yourcompany.com instead of a rootmail address, and it still lands in your Replies inbox. Add the subdomain under Settings → Sending, publish the two DNS records we show you (MX + TXT), and verify.",
      },
      {
        kind: "Improved",
        text: "Nothing breaks while you set it up: until your domain is switched on, replies keep coming to your rootmail inbox, so you never miss one mid-migration.",
      },
    ],
  },
  {
    title: "Replies, done right — a conversation with every contact",
    date: "2026-07-18",
    changes: [
      {
        kind: "New",
        text: "The Replies inbox is now a real messaging space: one conversation per contact, like a chat. Everything you've sent them — a campaign, a drip, a one-off — sits in their thread, each message labeled by where it came from, and you answer right in the app.",
      },
      {
        kind: "Improved",
        text: "Replies actually come back to you now. Choose under Settings → Sending whether a reply lands in your Replies inbox (recommended — nothing disappears into a no-reply void) or goes straight to your own mailbox. It applies to transactional email, campaigns, and sequences alike.",
      },
      {
        kind: "New",
        text: "The Replies inbox is now included on every plan, both wings — never lose a reply, whatever you're sending. It's in the transactional side too, not just marketing.",
      },
      {
        kind: "Improved",
        text: "New setup help: a plain-English “When people reply” card in Settings, and a “Set up your Replies inbox” step on your Overview, so it's clear where replies go before you send.",
      },
    ],
  },
  {
    title: "See a campaign land in real time — then turn it into a nurture",
    date: "2026-07-18",
    changes: [
      {
        kind: "New",
        text: "Open a sent campaign and watch it work: a live delivery-through-clicked funnel updates on its own, and every recipient is listed most-engaged first — with exactly what each person clicked and when. Click anyone to open their message, just like a transactional send.",
      },
      {
        kind: "New",
        text: "Follow up with a sequence, right from the campaign: “Drip to everyone who clicked using …” enrolls the people who engaged (or the ones who went cold) into an automated sequence in one click. Already-enrolled people are skipped, and anyone who replies exits the drip on their own.",
      },
      {
        kind: "Improved",
        text: "Campaign and sequence replies now come back to your own verified address, not a rootmail no-reply — so a real conversation starts in your inbox. The campaign header shows exactly where replies go before you send.",
      },
      {
        kind: "Improved",
        text: "The sequence builder now opens with a plain-English “How a sequence works” — a trigger enrolls a contact, steps run in order (wait, send, branch), and the whole thing stops the moment someone replies.",
      },
      {
        kind: "New",
        text: "For developers: GET /v1/campaigns/:id/recipients (paged, ranked by engagement) and POST /v1/campaigns/:id/follow-up (enroll a campaign's clicked / opened / cold recipients into a sequence).",
      },
    ],
  },
  {
    title: "Your campaigns now send from your own address",
    date: "2026-07-17",
    changes: [
      {
        kind: "Improved",
        text: "Once you verify a sending address under Settings → Sending, your campaigns and quick composes go out from it by default — not a rootmail no-reply. Pick which verified address is your default; the campaign composer shows exactly who mail will come from before you send.",
      },
    ],
  },
  {
    title: "One roof for your audience — people, imports, and audiences together",
    date: "2026-07-17",
    changes: [
      {
        kind: "New",
        text: "Contacts, Import, and Audiences merged into one Audience section: browse and search everyone you email, filter by tag, and add people by hand or from a file — the separate Import page is gone.",
      },
      {
        kind: "New",
        text: "Tags now work as subsets: click one to see just those people, then turn it into an audience in one click — or start a new audience from a tag when you create it.",
      },
      {
        kind: "New",
        text: "For developers: GET /v1/contacts (paged browse with search, tag, and status filters) and GET /v1/contacts/tags; POST /v1/lists accepts from_tag to seed a new audience.",
      },
      {
        kind: "Improved",
        text: "Suppression imports moved to Deliverability, where list hygiene lives — bring your old provider's suppression list from there.",
      },
    ],
  },
  {
    title: "Campaigns, rebuilt end-to-end — audiences, A/B by tags, and a guided composer",
    date: "2026-07-17",
    changes: [
      {
        kind: "New",
        text: "The campaign composer is now one guided flow: pick your audience (or just the contacts carrying a tag), pick a studio-designed template, and optionally A/B it — differently-tagged contacts get different versions, and the analytics show how each landed.",
      },
      {
        kind: "New",
        text: "A media library lives inside the template studio: picking an image now offers everything you've uploaded before — reuse, upload new, or delete — without leaving the canvas. The standalone Assets page is retired.",
      },
      {
        kind: "Improved",
        text: "Deliverability now tells a story: a plain-English verdict on your reputation, the four levers of inbox placement with links to act on each, and a teaching page (not a wall of zeros) before your first send.",
      },
      {
        kind: "Improved",
        text: "Webhooks, API keys, Team, and Client domains follow a view-first pattern: see what exists (or an empty state that teaches), and reveal the create form only when you ask — with how-to guides living in the docs.",
      },
    ],
  },
  {
    title: "Watch your email's whole journey — sent, delivered, opened, clicked",
    date: "2026-07-16",
    changes: [
      {
        kind: "New",
        text: "Every send now reports back in real time: the message page advances on its own from Queued to Sent to Delivered — and shows Opened and Clicked the moment they happen. No refreshing, no guessing.",
      },
      {
        kind: "New",
        text: "Your messages list shows how far each email actually got with a compact progress trail, and the overview turns your last 30 days into a connected funnel — sent → delivered → opened → clicked, with every rate and a bounce-health check alongside.",
      },
      {
        kind: "Improved",
        text: "Test sends are clearly separated from live mail (with their own lifecycle simulator), times everywhere show in your local timezone, and message details read plainly — developer identifiers now live in their own collapsed section.",
      },
    ],
  },
  {
    title: "A design studio for your emails — and a composer anyone can use",
    date: "2026-07-15",
    changes: [
      {
        kind: "New",
        text: "Templates are now a full design studio. Start from scratch, a basic layout, a ready-made template, or your own HTML — then build with a blocks palette (headings, text, images, buttons, video, dividers, spacers, headers and footers), arrange and restyle each block in an inspector, and set the whole email's look — brand color, backgrounds, fonts, corners, width — with no code. What you design is exactly what sends.",
      },
      {
        kind: "Improved",
        text: "Writing a message now feels like a normal email composer: rich formatting, a live preview of what your recipient sees, and attachments — add a PDF, image, or short video right from the composer. Press / to have AI draft the whole email from a sentence, or start from any of your templates.",
      },
      {
        kind: "Improved",
        text: "We took the developer-only controls out of the composer (the raw-HTML toggle and the idempotency-key field). Your sends are still protected from accidental double-clicks automatically, and the key is shown in each message's details when you need it.",
      },
    ],
  },
  {
    title: "Full developer docs — one reference, two places",
    date: "2026-07-14",
    changes: [
      {
        kind: "New",
        text: "A complete developer reference now lives at developers.gateml.io/docs: getting started, core concepts (idempotency, pagination, errors, sandbox, rate limits), and a page for every resource — messages, templates, contacts, audiences, campaigns, sequences, replies, client domains, webhooks (with signature verification), deliverability, proof, and the assistant — plus the SDK, CLI, and a migration guide.",
      },
      {
        kind: "Improved",
        text: "The same docs are built into the dashboard under Docs, so you can read the exact reference without leaving your workspace — one source of truth, never out of sync.",
      },
    ],
  },
  {
    title: "A living homepage that speaks your language",
    date: "2026-07-14",
    changes: [
      {
        kind: "Improved",
        text: "The whole marketing site was rewritten in plain, outcome-first language — no jargon, no code — with every feature framed as what you actually get. Sections rise into view as you scroll, cards react to your cursor, and buttons feel alive.",
      },
      {
        kind: "Improved",
        text: "Everything developer-focused — docs, install commands, the API tour — now lives entirely on developers.gateml.io, so the main site stays about the product, not the plumbing.",
      },
    ],
  },
  {
    title: "A site for everyone — and a new home for developers",
    date: "2026-07-14",
    changes: [
      {
        kind: "New",
        text: "Developers get their own site at developers.gateml.io: the full technical pitch — integrate once, change email behavior without redeploying, and everything the dashboard does, the API does.",
      },
      {
        kind: "Improved",
        text: "The main site now speaks to everyone: rootmail is a no-code product first — design emails visually, send campaigns, read replies — whether you're a clothing brand, a news desk, or a two-person startup.",
      },
      {
        kind: "Improved",
        text: "A new “Who it's for” section says it plainly: made for people, loved by developers — the same product from the dashboard, the API, or both.",
      },
    ],
  },
  {
    title: "The website now shows real, live pricing — with calculators",
    date: "2026-07-13",
    changes: [
      {
        kind: "New",
        text: "The public pricing page mirrors how rootmail actually bills: size your transactional volume in blocks or pick your audience size, and see the exact monthly and yearly price before you ever sign up.",
      },
      {
        kind: "Improved",
        text: "Every number on the pricing page is live — the same catalog the product bills from, sales included — so the website and your checkout can never disagree.",
      },
      {
        kind: "New",
        text: "All nine add-ons are listed publicly with per-one prices, and the billing promises are in writing: one bill, never billed twice, yearly is two months free.",
      },
    ],
  },
  {
    title: "A smoother dashboard: fluid navigation and one-click actions",
    date: "2026-07-13",
    changes: [
      {
        kind: "Improved",
        text: "The whole dashboard moves fluidly now — pages ease in as you navigate, the highlight glides to the section you open, and switching between Transactional and Marketing slides as one motion.",
      },
      {
        kind: "Improved",
        text: "The sidebar is wider, so Transactional, Marketing, and every section name show in full — no more cut-off labels on laptops.",
      },
      {
        kind: "New",
        text: "A “New” button in the top bar puts the six most common actions one click away from anywhere: send an email, start a campaign, design a template, import contacts, invite a teammate, create an API key.",
      },
    ],
  },
  {
    title: "One bill at checkout, and a clearer way to buy send blocks",
    date: "2026-07-13",
    changes: [
      {
        kind: "New",
        text: "Add-ons picked while buying a plan now appear inside the Stripe checkout itself — plan and add-ons together, one bill, monthly or yearly.",
      },
      {
        kind: "Improved",
        text: "Changing plans never double-charges: what you already own carries over automatically, and the unused time on your current plan is credited at checkout.",
      },
      {
        kind: "Improved",
        text: "The transactional page now shows how many blocks you're paying for versus what you're choosing (\"2 now → 4 after checkout\"), the full volume rate table, and what every plan includes.",
      },
      {
        kind: "Improved",
        text: "Add-on counters everywhere now count what you're adding — starting at zero — with \"you have N\" and \"you'll have N+X\" alongside.",
      },
      {
        kind: "New",
        text: "The sizing quiz got its own pop-up: type your monthly volume and it picks your blocks and shows the price before you commit.",
      },
    ],
  },
  {
    title: "Buying add-ons: a real checkout, charged immediately — only for what you add",
    date: "2026-07-13",
    changes: [
      {
        kind: "Fixed",
        text: "Buying an add-on now always opens the in-app Stripe checkout and charges your card right away — no more silent “you're all set” with the bill arriving later by email.",
      },
      {
        kind: "Improved",
        text: "Buying more of an add-on you already own credits everything you have on the invoice, so the charge is exactly the new part — you're never billed twice.",
      },
      {
        kind: "Improved",
        text: "The add-ons cart expands into a full order summary: what you have, what you'll have, each line's price, and what's due today.",
      },
      {
        kind: "New",
        text: "Every pricing surface is now its own page you can link to — transactional, marketing, and add-ons — and upgrade prompts across the app land you on the exact thing to buy, card highlighted.",
      },
    ],
  },
  {
    title: "Add-ons on their own, clearer marketing plans",
    date: "2026-07-11",
    changes: [
      {
        kind: "New",
        text: "Add-ons now have their own tab in Compare plans — browse them as proper product cards (what it does, the price, and how many you want) and buy them on their own, no plan required. They show what you already have, too.",
      },
      {
        kind: "Improved",
        text: "The Marketing plans are now an honest, side-by-side comparison: for your chosen contact size, each plan shows the real monthly emails, daily limit, number of audiences, and exactly which features it unlocks — with the plan names and prices staying pinned as you scroll. No vague wording.",
      },
      {
        kind: "Improved",
        text: "Audiences are now a real part of each Marketing plan (1, 3, 10, 50) instead of a vague 'unlimited' — you always know what your plan includes.",
      },
      {
        kind: "Fixed",
        text: "The Change plan button on Plan & usage now works, the plan tabs animate smoothly, and configuring add-ons during a Marketing purchase carries them into the same checkout.",
      },
    ],
  },
  {
    title: "One cart, one checkout",
    date: "2026-07-11",
    changes: [
      {
        kind: "Improved",
        text: "Building your plan now works like a normal cart: choose your send blocks, add a dedicated IP or client domains, and see an order summary on the right that adds everything up — then pay for it all in a single checkout, on one subscription.",
      },
      {
        kind: "Fixed",
        text: "Add-ons you choose while building a plan now stay part of that plan and show in your bill, instead of being a separate purchase that disappeared afterwards.",
      },
    ],
  },
  {
    title: "Checkout without leaving the page",
    date: "2026-07-11",
    changes: [
      {
        kind: "New",
        text: "Upgrading now happens right inside rootmail — pick your blocks, contact size, or add-ons and pay in an in-app checkout, no redirect to a separate page. Change your mind and edit your selection freely before you pay.",
      },
      {
        kind: "New",
        text: "Add-ons now flow through checkout: build your set, see the running monthly total, and pay for them together — no more silent changes.",
      },
      {
        kind: "Fixed",
        text: "Cancelling a checkout no longer leaves your plan looking upgraded. Your plan reflects only what you've actually paid for, and Plan & usage refreshes itself — you never have to reload to see the real status.",
      },
    ],
  },
  {
    title: "Pricing you can actually reason about",
    date: "2026-07-11",
    changes: [
      {
        kind: "New",
        text: "Marketing is now sized by your contact list: pick your audience size and each plan shows exactly what it gives you at that size — the monthly emails, the daily limit, and the price. 500 contacts and 5,000 contacts are genuinely different, so you never overpay for room you don't use.",
      },
      {
        kind: "New",
        text: "Plan & usage is now a proper billing dashboard: this month's estimated bill, live meters for transactional sends, marketing audience, and AI credits, an itemized breakdown of every charge, and your past invoices — each downloadable as a PDF.",
      },
      {
        kind: "Improved",
        text: "The separate Platform plan is gone. Seats, workspaces, custom roles, SSO, proof exports, residency, and AI credits are now simple add-ons priced per one — added wherever you need them, never a 'contact us'.",
      },
      {
        kind: "Improved",
        text: "Buying send blocks is clearer and friendlier: an emphasized yearly saving, transactional extras (dedicated IP, client domains) folded right in with plain-English explanations, and a 'not sure how many?' helper that sizes the blocks for you — only when you want it.",
      },
    ],
  },
  {
    title: "Each wing has its own pricing page now",
    date: "2026-07-09",
    changes: [
      {
        kind: "New",
        text: "Transactional, Marketing, and Platform each have a dedicated pricing page — its own meter, its own sizing question, its own plans and add-ons, and a plain-English tour of exactly what that side includes. No more one giant page for everything.",
      },
      {
        kind: "Improved",
        text: "Plan & usage now follows the wing you're working in: in Transactional you see send volume against your blocks; in Marketing you see your audience against its bracket — each side stands cleanly on its own.",
      },
      {
        kind: "Improved",
        text: "Every upgrade path lands on the right page: hit a send limit and you're taken to Transactional pricing, hit your contact bracket and you're taken to Marketing — with the other wings one deliberate click away, never mixed in.",
      },
    ],
  },
  {
    title: "Billing that reads like the product — per wing",
    date: "2026-07-09",
    changes: [
      {
        kind: "New",
        text: "Yearly billing is now available per wing — pay for send blocks, your Marketing bracket, or Platform yearly (2 months free), each side on its own schedule.",
      },
      {
        kind: "Improved",
        text: "Your bill now reads exactly like the product: a Transactional line (your blocks), a Marketing line (your bracket), and a Platform line — plus any overage, all itemized honestly.",
      },
      {
        kind: "Improved",
        text: "Add-ons now belong to their wing: dedicated IPs and client-domain packs extend Transactional, seats and workspace packs extend Platform — each billed on that wing's own subscription.",
      },
      {
        kind: "Improved",
        text: "Send past your blocks and the overage now bills automatically through a metered line — sending never stops, and you only pay for what actually went out.",
      },
    ],
  },
  {
    title: "Scaling is never punished — blocks and brackets",
    date: "2026-07-08",
    changes: [
      {
        kind: "New",
        text: "Transactional email is now bought in blocks of 25,000 sends at volume rates that drop as you grow ($8 → $7 → $6 per block). Estimate your volume, buy exactly that, change it any time — your first 3,000 sends each month stay free.",
      },
      {
        kind: "New",
        text: "Marketing email never counts against your send blocks. You pay for audience size, and a campaign to your whole audience is always included — a million contacts can receive a full promo round without touching transactional volume.",
      },
      {
        kind: "Improved",
        text: "Onboarding now sizes your account: tell us your monthly sends, contacts, and team, and the pricing page opens with your per-wing recommendation ready. Plan & usage shows each wing's real meter — sends against blocks, audience against its bracket.",
      },
      {
        kind: "Improved",
        text: "The old one-size plans (Free/Pro/Scale) are gone. Everything is per wing now — clearer, honest, and each side billed on its own.",
      },
    ],
  },
  {
    title: "Pay per wing — pricing you can actually choose",
    date: "2026-07-08",
    changes: [
      {
        kind: "New",
        text: "Per-wing pricing is live: Transactional is sized by send volume, Marketing by contacts, and Platform by your team — each on its own plan, billed on its own. Be Free on one side and scale the other; you only pay for what you use.",
      },
      {
        kind: "New",
        text: "Pick a tier right from Plan & usage → Pricing by wing: paid tiers check out through Stripe, Free tiers apply instantly, and wings you haven't chosen start on Free.",
      },
      {
        kind: "New",
        text: "Not sure what fits? Answer three questions — emails per month, contacts, team size — and we'll recommend a tier per wing with a combined monthly total.",
      },
    ],
  },
  {
    title: "Lists are now Audiences",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The marketing side now speaks in audiences — the distinct groups of people you communicate with (customers, subscribers, beta users). Create one, then send a campaign or sequence to exactly the right audience.",
      },
      {
        kind: "Improved",
        text: "The Audiences page shows how many audiences you have and your total memberships, and explains that a contact in more than one audience is counted in each — how contact-based marketing plans are sized.",
      },
    ],
  },
  {
    title: "Know exactly what's left to set up",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The Overview now tracks your setup progress — how many steps are left and roughly how long — and calls out the ones that actually block sending, like verifying a sending address, broken into clear sub-steps.",
      },
      {
        kind: "Improved",
        text: "Composing an email now reminds you to verify a sending address if you haven't yet, so mail can go out from your own domain instead of a rootmail one.",
      },
      {
        kind: "Improved",
        text: "The ⌘K search is refreshed and context-aware: grouped by the wing you're working in, with billing, add-ons, and settings all reachable — and it understands synonyms, so “domains”, “spf”, or “upgrade” find the right place.",
      },
    ],
  },
  {
    title: "Clearer wings, honest unlock pricing",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The Transactional and Marketing wings now explain themselves in plain English — a one-line description under the switcher and a tooltip on hover, so you always know what each side is for without any prior knowledge.",
      },
      {
        kind: "Fixed",
        text: "Locked sections were showing the unlocking plan's price far too small (a formatting bug — e.g. $0.80 instead of $80). They now show the plan's real price and make clear it unlocks the whole plan, not just that one feature.",
      },
      {
        kind: "Improved",
        text: "“Domains” is now “Client domains” — clearly distinct from your own from-address (which lives in Settings → Sending), so the two are never confused.",
      },
    ],
  },
  {
    title: "A design studio for your templates",
    date: "2026-07-07",
    changes: [
      {
        kind: "New",
        text: "Creating a template now opens a design gallery: pick a ready-made layout — Welcome, Password reset, Receipt or Notification for transactional; Newsletter, Announcement or Promotion for marketing — see it rendered as a real email, and edit it endlessly. No blank page to stare at.",
      },
      {
        kind: "Improved",
        text: "Template setup speaks plainly: choose “what's this for?” (Transactional or Marketing) instead of a raw type field, and the API slug is generated for you and tucked under Developer details.",
      },
    ],
  },
  {
    title: "Plans and templates, in the two wings",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The plan comparison now groups everything by what it's for — Transactional, Marketing, and Platform — and takes the time to explain, in plain words, what each feature actually does for you.",
      },
      {
        kind: "Improved",
        text: "Your templates shelve by purpose: Transactional blocks for product email, Marketing designs for your audience — opening on the shelf that matches where you're working.",
      },
    ],
  },
  {
    title: "Send as yourself — your own from-address",
    date: "2026-07-07",
    changes: [
      {
        kind: "New",
        text: "Add your own from-addresses under Settings → Sending: we email that inbox a confirmation link, and once clicked it appears in compose's From menu — hello@yourcompany.com instead of a rootmail address.",
      },
      {
        kind: "New",
        text: "Replies follow your business: mail sent from your address returns to your real inbox, no forwarding setup needed.",
      },
      {
        kind: "Improved",
        text: "If a send uses an unverified From, we now tell you plainly and point you to the fix — instead of a cryptic provider error.",
      },
      {
        kind: "Improved",
        text: "Templates now shelve by what they're for — Transactional blocks vs Marketing designs — and open on the shelf matching the wing you're working in.",
      },
      {
        kind: "Improved",
        text: "The plan comparison takes the time to explain what each feature actually does, in plain words under every line.",
      },
    ],
  },
  {
    title: "Compose that looks like email",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "Composing is now a real email surface: From, To, Subject, your message — with a live preview of exactly what your recipient gets, updating as you type.",
      },
      {
        kind: "New",
        text: "Templates are woven into writing: pick one under “Start from” and the preview fills in; add personalization and watch the placeholders resolve.",
      },
      {
        kind: "Improved",
        text: "No more jargon in the way — technical fields are gone or tucked behind Advanced, page descriptions across the dashboard now say what each section does in plain words, and upgrade buttons go straight to checkout.",
      },
    ],
  },
  {
    title: "Two dashboards: Transactional and Marketing",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "The dashboard now has two clear wings, because they're two different jobs: Transactional (the send API, templates & blocks, message log, domains, deliverability) and Marketing (campaigns, sequences, replies, audience, engagement). Switch with one click — rootmail remembers where you work.",
      },
      {
        kind: "Improved",
        text: "The primary action follows the wing: “Send email” in Transactional, “New campaign” in Marketing.",
      },
    ],
  },
  {
    title: "A proper welcome — onboarding that sets you up right",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "New accounts get a short guided setup: your business details (the postal address anti-spam law requires — added to your marketing footers automatically), what you do, and how you send today. Each step says why we ask.",
      },
      {
        kind: "New",
        text: "Setup ends with a plan recommendation matched to your answers — prices stay pinned while you compare what each tier actually does, and continuing on Free is always one click.",
      },
      {
        kind: "Improved",
        text: "Coming from SendGrid, Mailgun, Postmark, or Mailchimp? Telling us during setup points the migration importer at the right export from day one.",
      },
      {
        kind: "Improved",
        text: "Locked sections now show what they'd do for you — the concrete capabilities and the live price of the plan that unlocks them — instead of just a lock icon.",
      },
    ],
  },
  {
    title: "Single sign-on (SAML) for your team",
    date: "2026-07-04",
    changes: [
      {
        kind: "New",
        text: "Enterprise workspaces can now connect a SAML identity provider — Okta, Microsoft Entra ID, Google Workspace, or any SAML 2.0 IdP. Set it up in Settings → Single sign-on.",
      },
      {
        kind: "New",
        text: "Members sign in with “Log in with SSO”: enter your work email and you're routed to your company's identity provider. New teammates are provisioned automatically on first login.",
      },
      {
        kind: "New",
        text: "Optional enforcement turns off password login for your domain, so everyone signs in through your IdP.",
      },
      {
        kind: "New",
        text: "SCIM 2.0 provisioning: connect it in your identity provider and members are created, updated, and deactivated automatically — deprovisioned people lose access immediately.",
      },
    ],
  },
  {
    title: "Clearer settings, enterprise foundations",
    date: "2026-07-04",
    changes: [
      {
        kind: "Improved",
        text: "Settings is reorganized into clear tabs — Profile, Security & login, and Sender address — so each is a real page you can open directly, instead of a hub that led with your profile.",
      },
      {
        kind: "New",
        text: "Your Compliance page now shows data residency — exactly where this organization's data is stored and processed.",
      },
      {
        kind: "New",
        text: "We've mapped rootmail's security controls to the SOC 2 criteria as part of becoming enterprise-ready.",
      },
    ],
  },
  {
    title: "Send like a real business — compliance & migration",
    date: "2026-07-03",
    changes: [
      {
        kind: "New",
        text: "Set your business's postal address in Settings → Sender address; it's added automatically to marketing and sales footers to meet anti-spam law, with a live preview as you type.",
      },
      {
        kind: "New",
        text: "Bulk mail now carries one-click unsubscribe headers (RFC 8058), so Gmail and Yahoo show their native unsubscribe button — which keeps you on the right side of their bulk-sender rules.",
      },
      {
        kind: "New",
        text: "Import a template — upload or paste HTML from any provider, preview it, and save it as a rootmail template. SendGrid's Handlebars placeholders carry over unchanged.",
      },
      {
        kind: "New",
        text: "A hosted test inbox: every sandbox send appears in the dashboard with its full rendered content — no real mailbox needed, and it never touches your reputation.",
      },
      {
        kind: "Improved",
        text: "Contact and suppression import now takes a drag-in CSV file, not just paste — bring your SendGrid, Postmark, or Mailgun export straight in.",
      },
    ],
  },
  {
    title: "Upgrade where you hit the limit",
    date: "2026-07-01",
    changes: [
      {
        kind: "New",
        text: "Plan & usage is now two tabs — your current plan and usage on one, a full plan comparison with checkout on the other.",
      },
      {
        kind: "New",
        text: "Every limit you meet — send quota, workspaces, AI credits, a locked feature — links straight to the plan comparison, with a recommendation matched to your actual usage.",
      },
      {
        kind: "Improved",
        text: "Yearly prices show exactly what you save, each tier lists what it adds over the previous one, and the promo-code entry point is clearer.",
      },
    ],
  },
  {
    title: "See how every campaign lands",
    date: "2026-07-02",
    changes: [
      {
        kind: "New",
        text: "Campaigns and sequences now have engagement analytics — the sent → delivered → opened → clicked funnel per campaign, and per-step drop-off for sequences.",
      },
      {
        kind: "New",
        text: "Lifecycle email, done for you: payment receipts, password-change notices, a heads-up as you approach your monthly quota, and a nudge if you've been away a while.",
      },
      {
        kind: "Improved",
        text: "The AI assistant plans multi-step work — it discovers what exists, reuses it instead of duplicating, builds the rest, and ends with a checklist of everything it did.",
      },
      {
        kind: "Improved",
        text: "Messages in the dashboard are searchable and paged, so big send histories stay navigable.",
      },
    ],
  },
];

async function main(): Promise<void> {
  const existing = new Set(
    (await db.select({ title: changelogEntries.title }).from(changelogEntries)).map((r) => r.title),
  );
  let inserted = 0;
  for (const e of ENTRIES) {
    if (existing.has(e.title)) continue;
    await db.insert(changelogEntries).values({
      id: newId("changelogEntry"),
      title: e.title,
      entryDate: new Date(`${e.date}T12:00:00Z`),
      changes: e.changes,
      status: "published",
      publishedAt: new Date(),
      createdBy: null,
    });
    inserted++;
  }
  console.log(`changelog seed: ${inserted} inserted, ${ENTRIES.length - inserted} already present`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
